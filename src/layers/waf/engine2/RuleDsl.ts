/**
 * RuleDsl — a small expression language for custom WAF rules.
 *
 * Grammar (recursive descent → AST → compiled predicate):
 *
 *   expr     := orExpr
 *   orExpr   := andExpr ("or" andExpr)*
 *   andExpr  := notExpr ("and" notExpr)*
 *   notExpr  := "not" notExpr | primary
 *   primary  := "(" expr ")" | comparison
 *   comparison := operand op operand
 *   operand  := field | literal
 *   field    := "method" | "path" | "ip" | "country" | "body"
 *             | "header." ident | "query." ident
 *   literal  := '"' chars '"' | "'" chars "'" | number | ident
 *   op       := "==" | "!=" | "contains" | "startsWith" | "endsWith"
 *             | "matches"  (regex) | "in" "(" lit ("," lit)* ")"
 *             | "gt" | "lt"   (numeric compare)
 *
 * Examples:
 *   path startsWith "/admin" and header.x-role != "admin"
 *   method == "POST" and body contains "drop table"
 *   country in ("CN", "KP") or ip == "1.2.3.4"
 *   query.size gt 1000 and not path startsWith "/upload"
 *
 * Compilation is O(source length); evaluation is O(AST depth) — typically
 * < 20 nodes per rule.
 *
 * @module WafLayer/Engine2
 */

import { WafRequest2 } from './types';

/* ------------------------------------------------------------------------ */
/*  Tokenizer                                                                */
/* ------------------------------------------------------------------------ */

type Token =
  | { readonly kind: 'ident'; readonly value: string }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'lparen' }
  | { readonly kind: 'rparen' }
  | { readonly kind: 'comma' };

export class DslParseError extends Error {
  constructor(
    message: string,
    readonly position: number
  ) {
    super(`${message} (at ${position})`);
    this.name = 'DslParseError';
  }
}

const OPERATORS = new Set([
  '==', '!=', 'contains', 'startsWith', 'endsWith', 'matches', 'in', 'gt', 'lt',
]);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ kind: 'comma' });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      let j = i + 1;
      let buf = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          buf += src[j + 1];
          j += 2;
        } else {
          buf += src[j];
          j++;
        }
      }
      if (j >= src.length) throw new DslParseError('unterminated string', start);
      out.push({ kind: 'string', value: buf });
      i = j + 1;
      continue;
    }
    if (c === '=' && src[i + 1] === '=') {
      out.push({ kind: 'ident', value: '==' });
      i += 2;
      continue;
    }
    if (c === '!' && src[i + 1] === '=') {
      out.push({ kind: 'ident', value: '!=' });
      i += 2;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      out.push({ kind: 'number', value: Number(src.slice(start, i)) });
      continue;
    }
    // Identifier (may contain dots for field paths like header.x-foo).
    const start = i;
    while (i < src.length && /[A-Za-z0-9_.\-]/.test(src[i])) i++;
    if (i === start) throw new DslParseError(`unexpected character '${c}'`, i);
    out.push({ kind: 'ident', value: src.slice(start, i) });
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/*  AST                                                                      */
/* ------------------------------------------------------------------------ */

export type DslAst =
  | { readonly kind: 'or'; readonly left: DslAst; readonly right: DslAst }
  | { readonly kind: 'and'; readonly left: DslAst; readonly right: DslAst }
  | { readonly kind: 'not'; readonly child: DslAst }
  | {
      readonly kind: 'cmp';
      readonly op: string;
      readonly field: string;
      readonly literal: string | number | readonly string[];
    };

/** Parse DSL source into an AST. Throws DslParseError on bad syntax. */
export function parseDsl(src: string): DslAst {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos++];
    if (!t) throw new DslParseError('unexpected end of input', src.length);
    return t;
  };
  const isIdent = (v: string): boolean => {
    const t = peek();
    return t?.kind === 'ident' && t.value === v;
  };
  const eatIdent = (v: string): boolean => {
    if (isIdent(v)) {
      pos++;
      return true;
    }
    return false;
  };

  const parseExpr = (): DslAst => parseOr();

  const parseOr = (): DslAst => {
    let left = parseAnd();
    while (isIdent('or')) {
      pos++;
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  };

  const parseAnd = (): DslAst => {
    let left = parseNot();
    while (isIdent('and')) {
      pos++;
      left = { kind: 'and', left, right: parseNot() };
    }
    return left;
  };

  const parseNot = (): DslAst => {
    if (eatIdent('not')) {
      return { kind: 'not', child: parseNot() };
    }
    return parsePrimary();
  };

  const parsePrimary = (): DslAst => {
    const t = peek();
    if (t?.kind === 'lparen') {
      pos++;
      const e = parseExpr();
      const close = next();
      if (close.kind !== 'rparen') throw new DslParseError("expected ')'", pos);
      return e;
    }
    return parseComparison();
  };

  const parseComparison = (): DslAst => {
    const fieldTok = next();
    if (fieldTok.kind !== 'ident') {
      throw new DslParseError('expected field name', pos);
    }
    const field = fieldTok.value;
    const opTok = next();
    if (opTok.kind !== 'ident' || !OPERATORS.has(opTok.value)) {
      throw new DslParseError(`expected operator after '${field}'`, pos);
    }
    const op = opTok.value;

    if (op === 'in') {
      const lp = next();
      if (lp.kind !== 'lparen') throw new DslParseError("expected '(' after 'in'", pos);
      const lits: string[] = [];
      for (;;) {
        const lit = next();
        if (lit.kind === 'string' || lit.kind === 'ident') lits.push(String(lit.value));
        else if (lit.kind === 'number') lits.push(String(lit.value));
        else throw new DslParseError('expected literal in list', pos);
        const sep = next();
        if (sep.kind === 'rparen') break;
        if (sep.kind !== 'comma') throw new DslParseError("expected ',' or ')'", pos);
      }
      return { kind: 'cmp', op, field, literal: lits };
    }

    const lit = next();
    if (lit.kind === 'string' || lit.kind === 'ident') {
      return { kind: 'cmp', op, field, literal: String(lit.value) };
    }
    if (lit.kind === 'number') {
      return { kind: 'cmp', op, field, literal: lit.value };
    }
    throw new DslParseError('expected literal', pos);
  };

  const ast = parseExpr();
  if (pos < tokens.length) {
    throw new DslParseError(`unexpected trailing input '${JSON.stringify(tokens[pos])}'`, pos);
  }
  return ast;
}

/* ------------------------------------------------------------------------ */
/*  Evaluation                                                               */
/* ------------------------------------------------------------------------ */

/** Resolve a field path against the request. */
function fieldValue(req: WafRequest2, field: string): string | undefined {
  switch (field) {
    case 'method':
      return req.method;
    case 'path':
      return req.path;
    case 'ip':
      return req.clientIp;
    case 'country':
      return req.country;
    case 'body':
      return req.body;
    default:
      break;
  }
  if (field.startsWith('header.')) return req.headers[field.slice(7)];
  if (field.startsWith('query.')) return req.query[field.slice(6)];
  return undefined;
}

/** Evaluate a parsed AST against a request. */
export function evalDsl(ast: DslAst, req: WafRequest2): boolean {
  switch (ast.kind) {
    case 'and':
      return evalDsl(ast.left, req) && evalDsl(ast.right, req);
    case 'or':
      return evalDsl(ast.left, req) || evalDsl(ast.right, req);
    case 'not':
      return !evalDsl(ast.child, req);
    case 'cmp': {
      const raw = fieldValue(req, ast.field);
      if (raw === undefined) return false;
      switch (ast.op) {
        case '==':
          return raw === String(ast.literal);
        case '!=':
          return raw !== String(ast.literal);
        case 'contains':
          return raw.includes(String(ast.literal));
        case 'startsWith':
          return raw.startsWith(String(ast.literal));
        case 'endsWith':
          return raw.endsWith(String(ast.literal));
        case 'matches':
          return new RegExp(String(ast.literal)).test(raw);
        case 'in':
          return (ast.literal as readonly string[]).includes(raw);
        case 'gt':
          return Number(raw) > Number(ast.literal);
        case 'lt':
          return Number(raw) < Number(ast.literal);
        default:
          return false;
      }
    }
  }
}

/** A reusable compiled rule: parse once, evaluate per request. */
export class CompiledDsl {
  readonly source: string;
  readonly ast: DslAst;

  constructor(source: string) {
    this.source = source;
    this.ast = parseDsl(source);
  }

  matches(req: WafRequest2): boolean {
    return evalDsl(this.ast, req);
  }
}
