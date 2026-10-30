/**
 * JMESPath-Like JSON Query Engine
 *
 * A recursive-descent parser + tree-walking evaluator for a practical
 * subset of JMESPath: field access, indices, wildcards, flattening,
 * predicate filters, projections and pipes. Queries are parsed once
 * into an AST and can be evaluated many times — parse cost O(n) in
 * expression length, eval cost O(result size × path depth).
 *
 * @module ApiGatewayLayer/Engine2
 */

import {
  JsonValue,
  JsonObject,
  QueryNode,
  FilterCondition,
  CompareOp,
  QueryParseError,
  isJsonObject,
} from './types';

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokenKind =
  | 'ident'
  | 'number'
  | 'string'
  | 'lbracket'
  | 'rbracket'
  | 'lbrace'
  | 'rbrace'
  | 'dot'
  | 'star'
  | 'pipe'
  | 'comma'
  | 'colon'
  | 'question'
  | 'op'
  | 'literal'
  | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly pos: number;
}

const CMP_OPS: readonly string[] = ['==', '!=', '<=', '>=', '<', '>'];
const KEYWORDS = new Set(['true', 'false', 'null']);

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const push = (kind: TokenKind, text: string, pos: number): void => {
    tokens.push({ kind, text, pos });
  };

  while (i < n) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '.') {
      push('dot', '.', i);
      i++;
      continue;
    }
    if (c === '[') {
      push('lbracket', '[', i);
      i++;
      continue;
    }
    if (c === ']') {
      push('rbracket', ']', i);
      i++;
      continue;
    }
    if (c === '{') {
      push('lbrace', '{', i);
      i++;
      continue;
    }
    if (c === '}') {
      push('rbrace', '}', i);
      i++;
      continue;
    }
    if (c === '*') {
      push('star', '*', i);
      i++;
      continue;
    }
    if (c === '|') {
      push('pipe', '|', i);
      i++;
      continue;
    }
    if (c === ',') {
      push('comma', ',', i);
      i++;
      continue;
    }
    if (c === ':') {
      push('colon', ':', i);
      i++;
      continue;
    }
    if (c === '?') {
      push('question', '?', i);
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      // String literal; ` backtick strings are raw (JMESPath literal style).
      const quote = c;
      const start = i;
      i++;
      let text = '';
      while (i < n && input[i] !== quote) {
        if (quote !== '`' && input[i] === '\\' && i + 1 < n) {
          text += input[i + 1];
          i += 2;
          continue;
        }
        text += input[i];
        i++;
      }
      if (i >= n) throw new QueryParseError('unterminated string literal', start);
      i++;
      push('string', text, start);
      continue;
    }
    const op = CMP_OPS.find((o) => input.startsWith(o, i));
    if (op) {
      push('op', op, i);
      i += op.length;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const start = i;
      if (c === '-') i++;
      while (i < n && input[i] >= '0' && input[i] <= '9') i++;
      if (i < n && input[i] === '.') {
        i++;
        while (i < n && input[i] >= '0' && input[i] <= '9') i++;
      }
      push('number', input.slice(start, i), start);
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      const start = i;
      while (
        i < n &&
        ((input[i] >= 'a' && input[i] <= 'z') ||
          (input[i] >= 'A' && input[i] <= 'Z') ||
          (input[i] >= '0' && input[i] <= '9') ||
          input[i] === '_' ||
          input[i] === '-')
      ) {
        i++;
      }
      const word = input.slice(start, i);
      push(KEYWORDS.has(word) ? 'literal' : 'ident', word, start);
      continue;
    }
    throw new QueryParseError(`unexpected character '${c}'`, i);
  }
  push('eof', '', n);
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser — precedence: pipe < projection/primary < postfix (.field)
// ---------------------------------------------------------------------------

class Parser {
  private _tokens: Token[];
  private _pos = 0;

  constructor(input: string) {
    this._tokens = lex(input);
  }

  parse(): QueryNode {
    const node = this.parsePipe();
    this.expect('eof');
    return node;
  }

  private peek(): Token {
    return this._tokens[this._pos];
  }

  private next(): Token {
    return this._tokens[this._pos++];
  }

  private expect(kind: TokenKind): Token {
    const t = this.next();
    if (t.kind !== kind) {
      throw new QueryParseError(`expected ${kind}, got '${t.text || t.kind}'`, t.pos);
    }
    return t;
  }

  /** Pipe has the lowest precedence: `a.b | c.d`. */
  private parsePipe(): QueryNode {
    let left = this.parseSubExpr();
    while (this.peek().kind === 'pipe') {
      this.next();
      const right = this.parseSubExpr();
      left = { kind: 'pipe', left, right };
    }
    return left;
  }

  /**
   * A sub-expression: a primary followed by postfix steps parsed by
   * `parseChain`, which implements projection semantics.
   */
  private parseSubExpr(): QueryNode {
    return this.parseChain(this.parsePrimary());
  }

  /**
   * Postfix chain parser with JMESPath-style projection semantics.
   *
   * When a `.field` step follows an array-producing step (wildcard,
   * filter, or flatten), the *rest of the chain* becomes a per-element
   * projection: `items[*].price` evaluates `price` against each element
   * of `items` and returns `[10, 25, 5]`. A projection step is a
   * sibling node wrapping both the source and the per-element query.
   */
  private parseChain(node: QueryNode): QueryNode {
    let cur = node;
    for (;;) {
      const t = this.peek();
      const arrayProducing =
        cur.kind === 'wildcard' || cur.kind === 'filter' || cur.kind === 'flatten';
      if (t.kind === 'dot' && arrayProducing) {
        this.next();
        // The remainder after the dot is a fresh sub-expression
        // evaluated per element: `a[*].b.c` projects `b.c`.
        const inner = this.parseSubExpr();
        cur = { kind: 'project', source: cur, child: inner };
        continue;
      }
      if (t.kind === 'dot') {
        this.next();
        if (this.peek().kind === 'star') {
          this.next();
          cur = { kind: 'wildcard', child: cur };
          continue;
        }
        const field = this.expect('ident');
        cur = { kind: 'field', name: field.text, child: cur };
        continue;
      }
      if (t.kind === 'lbracket') {
        this.next();
        const inner = this.peek();
        if (inner.kind === 'star') {
          // `[*]` — wildcard over array elements / object values.
          this.next();
          this.expect('rbracket');
          cur = { kind: 'wildcard', child: cur };
          continue;
        }
        if (inner.kind === 'number') {
          this.next();
          this.expect('rbracket');
          cur = { kind: 'index', index: Number.parseInt(inner.text, 10), child: cur };
          continue;
        }
        if (inner.kind === 'rbracket') {
          this.next();
          cur = { kind: 'flatten', child: cur };
          continue;
        }
        if (inner.kind === 'question') {
          this.next();
          const cond = this.parseCondition();
          this.expect('rbracket');
          cur = { kind: 'filter', condition: cond, child: cur };
          continue;
        }
        throw new QueryParseError('expected index, `]`, `*`, or `?` filter', inner.pos);
      }
      return cur;
    }
  }

  private parseCondition(): FilterCondition {
    const path: string[] = [this.expect('ident').text];
    while (this.peek().kind === 'dot') {
      this.next();
      path.push(this.expect('ident').text);
    }
    const op = this.expect('op').text as CompareOp;
    const valueTok = this.next();
    let value: JsonValue;
    switch (valueTok.kind) {
      case 'number':
        value = Number.parseFloat(valueTok.text);
        break;
      case 'string':
        value = valueTok.text;
        break;
      case 'literal':
        value = valueTok.text === 'true' ? true : valueTok.text === 'false' ? false : null;
        break;
      default:
        throw new QueryParseError('expected literal in filter condition', valueTok.pos);
    }
    return { path, op, value };
  }

  private parsePrimary(): QueryNode {
    const t = this.peek();
    if (t.kind === 'ident') {
      this.next();
      return { kind: 'field', name: t.text, child: { kind: 'identity' } };
    }
    if (t.kind === 'star') {
      this.next();
      return { kind: 'wildcard', child: { kind: 'identity' } };
    }
    if (t.kind === 'lbrace') {
      return this.parseProjection();
    }
    if (t.kind === 'lbracket') {
      // Index/flatten/filter at the root (e.g. `[0]`, `[]`, `[?a==1]`).
      return { kind: 'identity' };
    }
    if (t.kind === 'number' || t.kind === 'string' || t.kind === 'literal') {
      this.next();
      const value: JsonValue =
        t.kind === 'number'
          ? Number.parseFloat(t.text)
          : t.kind === 'string'
            ? t.text
            : t.text === 'true'
              ? true
              : t.text === 'false'
                ? false
                : null;
      return { kind: 'literal', value };
    }
    throw new QueryParseError(`unexpected token '${t.text || t.kind}'`, t.pos);
  }

  /** `{a: expr, b: expr}` — projects sub-queries into a fresh object. */
  private parseProjection(): QueryNode {
    this.expect('lbrace');
    const fields: Array<{ name: string; query: QueryNode }> = [];
    while (this.peek().kind !== 'rbrace') {
      const name = this.expect('ident').text;
      this.expect('colon');
      const query = this.parsePipe();
      fields.push({ name, query });
      if (this.peek().kind === 'comma') {
        this.next();
        continue;
      }
      break;
    }
    this.expect('rbrace');
    return { kind: 'projection', fields };
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function compare(left: JsonValue | undefined, op: CompareOp, right: JsonValue): boolean {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return typeof left === 'number' && typeof right === 'number' && left < right;
    case '<=':
      return typeof left === 'number' && typeof right === 'number' && left <= right;
    case '>':
      return typeof left === 'number' && typeof right === 'number' && left > right;
    case '>=':
      return typeof left === 'number' && typeof right === 'number' && left >= right;
  }
}

function getPath(value: JsonValue | undefined, path: readonly string[]): JsonValue | undefined {
  let cur = value;
  for (const key of path) {
    if (!isJsonObject(cur as JsonValue)) return undefined;
    cur = (cur as JsonObject)[key];
  }
  return cur;
}

/** Evaluate a parsed query against a JSON document. Returns `undefined` for no-match. */
export function evaluateQuery(node: QueryNode, doc: JsonValue | undefined): JsonValue | undefined {
  switch (node.kind) {
    case 'identity':
      return doc;
    case 'literal':
      return node.value;
    case 'field': {
      const base = evaluateQuery(node.child, doc);
      if (!isJsonObject(base as JsonValue)) return undefined;
      return (base as JsonObject)[node.name];
    }
    case 'project': {
      const base = evaluateQuery(node.source, doc);
      if (!Array.isArray(base)) return undefined;
      const out: JsonValue[] = [];
      for (const el of base) {
        const v = evaluateQuery(node.child, el);
        if (v !== undefined) out.push(v);
      }
      return out;
    }
    case 'index': {
      const base = evaluateQuery(node.child, doc);
      if (!Array.isArray(base)) return undefined;
      const idx = node.index < 0 ? base.length + node.index : node.index;
      return idx >= 0 && idx < base.length ? base[idx] : undefined;
    }
    case 'wildcard': {
      const base = evaluateQuery(node.child, doc);
      if (Array.isArray(base)) return base;
      if (isJsonObject(base as JsonValue)) return Object.values(base as JsonObject);
      return undefined;
    }
    case 'flatten': {
      const base = evaluateQuery(node.child, doc);
      if (!Array.isArray(base)) return undefined;
      const out: JsonValue[] = [];
      for (const el of base) {
        if (Array.isArray(el)) out.push(...el);
        else out.push(el);
      }
      return out;
    }
    case 'filter': {
      const base = evaluateQuery(node.child, doc);
      if (!Array.isArray(base)) return undefined;
      return base.filter((el) =>
        compare(getPath(el, node.condition.path), node.condition.op, node.condition.value)
      );
    }
    case 'projection': {
      const out: JsonObject = {};
      for (const f of node.fields) {
        const v = evaluateQuery(f.query, doc);
        if (v !== undefined) out[f.name] = v;
      }
      return out;
    }
    case 'pipe': {
      const left = evaluateQuery(node.left, doc);
      return evaluateQuery(node.right, left);
    }
  }
}

/**
 * Parse a query once, evaluate many times. The AST is immutable and
 * safe to cache per route/reshape rule.
 */
export class CompiledQuery {
  private readonly _ast: QueryNode;

  constructor(source: string) {
    this._ast = new Parser(source).parse();
  }

  get ast(): QueryNode {
    return this._ast;
  }

  evaluate(doc: JsonValue | undefined): JsonValue | undefined {
    return evaluateQuery(this._ast, doc);
  }
}

/** Convenience: parse + evaluate in one call. */
export function queryJson(source: string, doc: JsonValue | undefined): JsonValue | undefined {
  return new CompiledQuery(source).evaluate(doc);
}
