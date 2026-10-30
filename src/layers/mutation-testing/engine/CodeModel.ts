/**
 * CodeModel — TypeScript-like tokenizer + lightweight AST
 *
 * The mutation engine operates on a real syntactic model rather than raw
 * text so that operators can distinguish e.g. `+` used as binary
 * arithmetic from unary plus or string concat inside a template, and so
 * mutants carry precise line/column provenance.
 *
 * Pipeline:
 *   source ─▶ tokenize() ─▶ Token[]
 *           ─▶ parse()    ─▶ TUProgram (block tree of TSNode)
 *
 * The grammar is intentionally a pragmatic subset — expressions,
 * statements, loops, functions, classes — sufficient for the standard
 * operator set (arithmetic/relational/conditional/negation/literal/
 * loop-bound/increment). Unhandled constructs degrade gracefully to
 * opaque expression nodes, never to parse failure, so partially exotic
 * files can still be mutated where understood.
 *
 * Tokenizer: O(n) single pass. Parser: O(n) recursive descent with
 * precedence-climbing for binary operators.
 *
 * @module MutationTesting/Engine
 */

/* ------------------------------------------------------------------------ */
/* Tokens                                                                   */
/* ------------------------------------------------------------------------ */

export type TokenKind =
  | 'number'
  | 'string'
  | 'template'
  | 'identifier'
  | 'keyword'
  | 'punct'
  | 'regex'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  /** 0-based character offset in source. */
  readonly start: number;
  readonly end: number;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'return', 'function', 'const', 'let', 'var', 'class', 'extends',
  'new', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally',
  'throw', 'async', 'await', 'yield', 'import', 'export', 'from', 'as',
  'interface', 'type', 'enum', 'namespace', 'declare', 'implements',
  'public', 'private', 'protected', 'readonly', 'static', 'abstract',
  'get', 'set', 'this', 'super', 'true', 'false', 'null', 'undefined',
  'void', 'delete', 'override', 'accessor',
]);

const PUNCTS = [
  '===', '!==', '**=', '>>>', '<<=', '>>=', '&&=', '||=', '??=', '...',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '&', '|', '^',
  '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '@', '#',
];

/**
 * Tokenize source text. Comments and whitespace are skipped; offsets are
 * recorded per token so mutants can splice replacements into the original
 * source and preserve formatting.
 *
 * Complexity: O(source length).
 */
export function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = source.length;

  const advance = (count: number): void => {
    for (let k = 0; k < count; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  const push = (kind: TokenKind, value: string, start: number, end: number, l: number, c: number): void => {
    tokens.push({ kind, value, start, end, line: l, column: c });
  };

  while (i < n) {
    const ch = source[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }
    // line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') advance(1);
      continue;
    }
    // block comment
    if (ch === '/' && source[i + 1] === '*') {
      advance(2);
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) advance(1);
      advance(2);
      continue;
    }

    const start = i;
    const startLine = line;
    const startCol = col;

    // numbers: decimal, hex, bin, oct, floats, exponents, separators, bigint
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let j = i;
      if (ch === '0' && /[xXbBoO]/.test(source[i + 1] ?? '')) {
        j += 2;
        while (j < n && /[0-9a-fA-F_]/.test(source[j])) j++;
      } else {
        while (j < n && /[0-9_]/.test(source[j])) j++;
        if (source[j] === '.') {
          j++;
          while (j < n && /[0-9_]/.test(source[j])) j++;
        }
        if (source[j] === 'e' || source[j] === 'E') {
          j++;
          if (source[j] === '+' || source[j] === '-') j++;
          while (j < n && /[0-9]/.test(source[j])) j++;
        }
      }
      if (source[j] === 'n') j++;
      const value = source.slice(i, j);
      advance(j - i);
      push('number', value, start, j, startLine, startCol);
      continue;
    }

    // strings
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch) {
        if (source[j] === '\\') j++;
        j++;
      }
      j++;
      const value = source.slice(i, j);
      advance(j - i);
      push('string', value, start, j, startLine, startCol);
      continue;
    }

    // template literals — kept as one opaque token so `${}` internals
    // are not mutated (avoids generating syntactically broken output).
    if (ch === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '`' && depth === 0) break;
        if (source[j] === '$' && source[j + 1] === '{') depth++;
        else if (source[j] === '}') depth--;
        j++;
      }
      j++;
      const value = source.slice(i, j);
      advance(j - i);
      push('template', value, start, j, startLine, startCol);
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j++;
      const value = source.slice(i, j);
      advance(j - i);
      push(KEYWORDS.has(value) ? 'keyword' : 'identifier', value, start, j, startLine, startCol);
      continue;
    }

    // regex literal heuristic: '/' starts a regex when the previous
    // significant token cannot end an expression.
    if (ch === '/' && source[i + 1] !== '/' && source[i + 1] !== '*' && source[i + 1] !== '=') {
      const prev = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
      const canBeRegex =
        prev === undefined ||
        (prev.kind === 'keyword' &&
          !['this', 'super', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof'].includes(
            prev.value
          )) ||
        (prev.kind === 'punct' && ![')', ']', '}', '++', '--'].includes(prev.value));
      if (canBeRegex) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const c = source[j];
          if (c === '\\') {
            j += 2;
            continue;
          }
          if (c === '[') {
            inClass = true;
            j++;
          } else if (c === ']') {
            inClass = false;
            j++;
          } else if (c === '/' && !inClass) {
            j++;
            break;
          } else if (c === '\n') {
            break;
          } else {
            j++;
          }
        }
        while (j < n && /[a-z]/.test(source[j])) j++;
        const value = source.slice(i, j);
        advance(j - i);
        push('regex', value, start, j, startLine, startCol);
        continue;
      }
    }

    // punctuation (longest match first — PUNCTS is ordered)
    let matched = false;
    for (const p of PUNCTS) {
      if (source.startsWith(p, i)) {
        advance(p.length);
        push('punct', p, start, i, startLine, startCol);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // unknown character — emit single-char punct to keep positions sane
      advance(1);
      push('punct', ch, start, i, startLine, startCol);
    }
  }

  tokens.push({ kind: 'eof', value: '', start: n, end: n, line, column: col });
  return tokens;
}

/* ------------------------------------------------------------------------ */
/* AST                                                                      */
/* ------------------------------------------------------------------------ */

/** Node kinds understood by the mutation operators. */
export type NodeKind =
  | 'Program'
  | 'Block'
  | 'VarDecl'
  | 'IfStatement'
  | 'ForStatement'
  | 'WhileStatement'
  | 'DoWhileStatement'
  | 'ReturnStatement'
  | 'FunctionDecl'
  | 'ClassDecl'
  | 'ExpressionStatement'
  | 'SwitchStatement'
  | 'TryStatement'
  | 'ThrowStatement'
  | 'ExportDecl'
  | 'BreakStatement'
  | 'ContinueStatement'
  | 'BinaryExpr'
  | 'LogicalExpr'
  | 'UnaryExpr'
  | 'UpdateExpr'
  | 'ConditionalExpr'
  | 'CallExpr'
  | 'MemberExpr'
  | 'IndexExpr'
  | 'AssignmentExpr'
  | 'Literal'
  | 'Identifier'
  | 'ArrayLiteral'
  | 'ObjectLiteral'
  | 'ArrowFunction'
  | 'NewExpr'
  | 'AwaitExpr'
  | 'SpreadExpr'
  | 'ParenExpr'
  | 'RawExpr';

export interface TSNode {
  readonly kind: NodeKind;
  /** token range [tokenStart, tokenEnd) into the program token array */
  readonly tokenStart: number;
  readonly tokenEnd: number;
  /** character range [start, end) in source */
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
  readonly children: readonly TSNode[];
  /** kind-specific payload */
  readonly data?: {
    readonly operator?: string;
    readonly name?: string;
    readonly literalType?: 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'regex' | 'template';
    readonly literalValue?: string;
    readonly prefix?: boolean;
    readonly declKind?: 'const' | 'let' | 'var';
  };
}

export interface TUProgram {
  readonly kind: 'Program';
  readonly source: string;
  readonly tokens: readonly Token[];
  readonly body: readonly TSNode[];
}

/* ------------------------------------------------------------------------ */
/* Parser                                                                   */
/* ------------------------------------------------------------------------ */

/** Binary operator precedence (higher binds tighter). */
const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '??': 1,
  '||': 2,
  '&&': 3,
  '|': 4,
  '^': 5,
  '&': 6,
  '==': 7, '!=': 7, '===': 7, '!==': 7,
  '<': 8, '<=': 8, '>': 8, '>=': 8, instanceof: 8, in: 8,
  '<<': 9, '>>': 9, '>>>': 9,
  '+': 10, '-': 10,
  '*': 11, '/': 11, '%': 11,
  '**': 12,
};

const RIGHT_ASSOC = new Set(['**']);

const ASSIGNMENT_OPS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=',
  '&=', '|=', '^=', '&&=', '||=', '??=', '**=',
]);

/**
 * Recursive-descent parser over the token array. Best-effort:
 * unrecognized constructs are captured as `RawExpr` nodes spanning their
 * tokens so the tree covers the full file and `emitNode` reproduces
 * source text verbatim.
 */
export function parse(source: string): TUProgram {
  const tokens = tokenize(source);
  const p = new Parser(tokens);
  const body = p.parseTopLevel();
  return { kind: 'Program', source, tokens, body };
}

class Parser {
  private _pos = 0;

  constructor(private readonly _tokens: readonly Token[]) {}

  /* ---------------- token helpers ---------------- */

  private peek(offset = 0): Token {
    const idx = Math.min(this._pos + offset, this._tokens.length - 1);
    return this._tokens[idx];
  }

  private next(): Token {
    const t = this._tokens[this._pos];
    if (this._pos < this._tokens.length - 1) this._pos++;
    return t;
  }

  private at(kind: TokenKind, value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private atPunct(value: string): boolean {
    return this.at('punct', value) || this.at('keyword', value);
  }

  private eat(kind: TokenKind, value?: string): Token | undefined {
    if (this.at(kind, value)) return this.next();
    return undefined;
  }

  private eatPunct(value: string): Token | undefined {
    if (this.atPunct(value)) return this.next();
    return undefined;
  }

  private expect(value: string): Token {
    const t = this.eatPunct(value);
    if (!t) {
      const got = this.peek();
      throw new Error(`expected '${value}' at line ${got.line}, got '${got.value}'`);
    }
    return t;
  }

  private nodeFrom(startIdx: number, kind: NodeKind, children: TSNode[], data?: TSNode['data']): TSNode {
    const s = this._tokens[startIdx];
    const last = this._tokens[Math.max(startIdx, this._pos - 1)];
    return {
      kind,
      tokenStart: startIdx,
      tokenEnd: this._pos,
      start: s.start,
      end: last.end,
      line: s.line,
      column: s.column,
      children,
      data,
    };
  }

  /** Wrap a token range into a RawExpr (opaque but source-faithful). */
  private rawFrom(startIdx: number): TSNode {
    const s = this._tokens[startIdx];
    const e = this._tokens[Math.max(startIdx, this._pos - 1)];
    return {
      kind: 'RawExpr',
      tokenStart: startIdx,
      tokenEnd: this._pos,
      start: s.start,
      end: e.end,
      line: s.line,
      column: s.column,
      children: [],
    };
  }

  /* ---------------- top level ---------------- */

  parseTopLevel(): TSNode[] {
    const out: TSNode[] = [];
    while (!this.at('eof')) {
      const before = this._pos;
      const stmt = this.parseStatement();
      if (stmt) out.push(stmt);
      if (this._pos === before) this.next(); // guarantee progress
    }
    return out;
  }

  /* ---------------- statements ---------------- */

  parseStatement(): TSNode | undefined {
    const t = this.peek();
    const startIdx = this._pos;

    switch (t.value) {
      case '{': return this.parseBlock();
      case 'const':
      case 'let':
      case 'var': return this.parseVarDecl();
      case 'if': return this.parseIf();
      case 'for': return this.parseFor();
      case 'while': return this.parseWhile();
      case 'do': return this.parseDoWhile();
      case 'return': {
        this.next();
        const arg =
          this.at('punct', ';') || this.at('punct', '}') || this.at('eof')
            ? undefined
            : this.parseExpression();
        this.eatPunct(';');
        return this.nodeFrom(startIdx, 'ReturnStatement', arg ? [arg] : []);
      }
      case 'function': return this.parseFunctionDecl(false);
      case 'async': {
        if (this._tokens[this._pos + 1]?.value === 'function') {
          return this.parseFunctionDecl(true);
        }
        break; // async arrow — falls through to expression statement
      }
      case 'class': return this.parseClassDecl();
      case 'switch': return this.parseSwitch();
      case 'try': return this.parseTry();
      case 'throw': {
        this.next();
        const arg = this.parseExpression();
        this.eatPunct(';');
        return this.nodeFrom(startIdx, 'ThrowStatement', arg ? [arg] : []);
      }
      case 'break':
      case 'continue': {
        this.next();
        if (this.at('identifier')) this.next(); // label
        this.eatPunct(';');
        return this.nodeFrom(
          startIdx,
          t.value === 'break' ? 'BreakStatement' : 'ContinueStatement',
          []
        );
      }
      case 'import': return this.parseImport();
      case 'export': return this.parseExport();
      case 'interface':
      case 'type':
      case 'enum':
      case 'namespace':
      case 'declare': {
        this.skipTypeConstruct();
        return this.rawFrom(startIdx);
      }
    }
    const expr = this.parseExpression();
    this.eatPunct(';');
    if (expr) return this.nodeFrom(startIdx, 'ExpressionStatement', [expr]);
    return undefined;
  }

  private parseBlock(): TSNode {
    const startIdx = this._pos;
    this.expect('{');
    const body: TSNode[] = [];
    while (!this.at('punct', '}') && !this.at('eof')) {
      const before = this._pos;
      const s = this.parseStatement();
      if (s) body.push(s);
      if (this._pos === before) this.next();
    }
    this.eatPunct('}');
    return this.nodeFrom(startIdx, 'Block', body);
  }

  private parseVarDecl(): TSNode {
    const startIdx = this._pos;
    const kw = this.next(); // const/let/var
    const declKind = kw.value as 'const' | 'let' | 'var';
    const decls: TSNode[] = [];
    for (;;) {
      if (this.at('punct', '{') || this.at('punct', '[')) {
        const s = this._pos;
        this.skipBalanced();
        decls.push(this.rawFrom(s));
      } else {
        const nameTok = this.eat('identifier') ?? this.eat('keyword');
        if (nameTok) {
          const idx = this._pos - 1;
          decls.push(this.nodeFrom(idx, 'Identifier', [], { name: nameTok.value }));
        }
      }
      if (this.eatPunct(':')) this.skipTypeAnnotation();
      if (this.eatPunct('=')) {
        const init = this.parseExpression();
        if (init) decls.push(init);
      }
      if (!this.eatPunct(',')) break;
    }
    this.eatPunct(';');
    return this.nodeFrom(startIdx, 'VarDecl', decls, { declKind });
  }

  private parseIf(): TSNode {
    const startIdx = this._pos;
    this.expect('if');
    this.expect('(');
    const test = this.parseExpression();
    this.expect(')');
    const cons = this.parseStatement();
    let alt: TSNode | undefined;
    if (this.eat('keyword', 'else')) {
      alt = this.parseStatement();
    }
    return this.nodeFrom(
      startIdx,
      'IfStatement',
      [test, cons, alt].filter((n): n is TSNode => n !== undefined)
    );
  }

  private parseFor(): TSNode {
    const startIdx = this._pos;
    this.expect('for');
    this.eat('keyword', 'await');
    this.expect('(');
    const parts: TSNode[] = [];
    if (
      this.at('keyword', 'const') ||
      this.at('keyword', 'let') ||
      this.at('keyword', 'var')
    ) {
      const kIdx = this._pos;
      const k = this.next();
      const declKind = k.value as 'const' | 'let' | 'var';
      const inner: TSNode[] = [];
      if (this.at('punct', '{') || this.at('punct', '[')) {
        const s = this._pos;
        this.skipBalanced();
        inner.push(this.rawFrom(s));
      } else {
        const nameTok = this.eat('identifier') ?? this.eat('keyword');
        if (nameTok) {
          inner.push(this.nodeFrom(this._pos - 1, 'Identifier', [], { name: nameTok.value }));
        }
      }
      if (this.eatPunct(':')) this.skipTypeAnnotation();
      // for-init declarations may carry initializers (`let i = 0`)
      // unless this is a for-in/of (`const x of xs`) — the keyword
      // check comes first so `=` in `for-of` is never hit.
      if (this.eatPunct('=')) {
        const init = this.parseExpression();
        if (init) inner.push(init);
        while (this.eatPunct(',')) {
          const nameTok = this.eat('identifier') ?? this.eat('keyword');
          if (nameTok) {
            inner.push(this.nodeFrom(this._pos - 1, 'Identifier', [], { name: nameTok.value }));
          }
          if (this.eatPunct(':')) this.skipTypeAnnotation();
          if (this.eatPunct('=')) {
            const e = this.parseExpression();
            if (e) inner.push(e);
          }
        }
      }
      parts.push(this.nodeFrom(kIdx, 'VarDecl', inner, { declKind }));
    } else if (!this.at('punct', ';')) {
      const e = this.parseExpression();
      if (e) parts.push(e);
    }
    // for-in / for-of
    if (this.at('keyword', 'of') || this.at('keyword', 'in')) {
      this.next();
      const rhs = this.parseExpression();
      if (rhs) parts.push(rhs);
      this.expect(')');
      const body = this.parseStatement();
      return this.nodeFrom(
        startIdx,
        'ForStatement',
        [...parts, body].filter((n): n is TSNode => n !== undefined),
        { operator: 'for-of' }
      );
    }
    this.expect(';');
    const test = this.at('punct', ';') ? undefined : this.parseExpression();
    this.expect(';');
    const update = this.at('punct', ')') ? undefined : this.parseExpression();
    this.expect(')');
    const body = this.parseStatement();
    return this.nodeFrom(
      startIdx,
      'ForStatement',
      [...parts, test, update, body].filter((n): n is TSNode => n !== undefined),
      { operator: 'classic' }
    );
  }

  private parseWhile(): TSNode {
    const startIdx = this._pos;
    this.expect('while');
    this.expect('(');
    const test = this.parseExpression();
    this.expect(')');
    const body = this.parseStatement();
    return this.nodeFrom(
      startIdx,
      'WhileStatement',
      [test, body].filter((n): n is TSNode => n !== undefined)
    );
  }

  private parseDoWhile(): TSNode {
    const startIdx = this._pos;
    this.expect('do');
    const body = this.parseStatement();
    this.expect('while');
    this.expect('(');
    const test = this.parseExpression();
    this.expect(')');
    this.eatPunct(';');
    return this.nodeFrom(
      startIdx,
      'DoWhileStatement',
      [body, test].filter((n): n is TSNode => n !== undefined)
    );
  }

  private parseFunctionDecl(isAsync: boolean): TSNode {
    const startIdx = this._pos;
    if (isAsync) this.next();
    this.expect('function');
    this.eatPunct('*');
    const nameTok = this.eat('identifier') ?? this.eat('keyword');
    if (this.at('punct', '<')) {
      this.next();
      this.skipAngle();
    }
    this.skipBalanced(); // params — starts at '(' and may carry types
    if (this.eatPunct(':')) this.skipTypeAnnotation();
    const body = this.at('punct', '{') ? this.parseBlock() : undefined;
    return this.nodeFrom(startIdx, 'FunctionDecl', body ? [body] : [], {
      name: nameTok?.value,
    });
  }

  private parseClassDecl(): TSNode {
    const startIdx = this._pos;
    this.expect('class');
    const nameTok = this.eat('identifier');
    const kids: TSNode[] = [];
    if (this.eat('keyword', 'extends')) {
      const sup = this.parseExpression(0);
      if (sup) kids.push(sup);
    }
    while (this.eat('keyword', 'implements')) {
      this.eat('identifier');
      while (this.eatPunct(',')) this.eat('identifier');
    }
    if (this.at('punct', '{')) {
      kids.push(this.parseClassBody());
    }
    return this.nodeFrom(startIdx, 'ClassDecl', kids, { name: nameTok?.value });
  }

  private parseClassBody(): TSNode {
    const startIdx = this._pos;
    this.expect('{');
    const members: TSNode[] = [];
    while (!this.at('punct', '}') && !this.at('eof')) {
      const mStart = this._pos;
      while (
        this.at('keyword') &&
        [
          'public', 'private', 'protected', 'readonly', 'static', 'abstract',
          'async', 'declare', 'override', 'accessor', 'get', 'set',
        ].includes(this.peek().value)
      ) {
        this.next();
      }
      if (this.at('punct', '*')) this.next();
      if (this.at('punct', '#')) this.next();
      if (this.at('punct', '[')) {
        this.skipBalanced();
      } else {
        const name = this.eat('identifier') ?? this.eat('keyword') ?? this.eat('string');
        if (!name) {
          if (this.at('punct', '{')) {
            members.push(this.parseBlock()); // static block
            continue;
          }
          this.next();
          continue;
        }
        if (this.at('punct', '<')) {
          this.next();
          this.skipAngle();
        }
        if (this.at('punct', '(')) {
          this.skipBalanced();
          if (this.eatPunct(':')) this.skipTypeAnnotation();
          if (this.at('punct', '{')) {
            members.push(this.parseBlock());
          } else {
            this.eatPunct(';');
            members.push(this.rawFrom(mStart));
          }
        } else {
          if (this.eatPunct(':')) this.skipTypeAnnotation();
          if (this.eatPunct('=')) {
            const init = this.parseExpression();
            if (init) {
              members.push(this.nodeFrom(mStart, 'VarDecl', [init], { declKind: 'let' }));
            } else {
              members.push(this.rawFrom(mStart));
            }
          } else {
            this.eatPunct(';');
            members.push(this.rawFrom(mStart));
          }
          this.eatPunct(';');
        }
      }
      if (this._pos === mStart) this.next();
    }
    this.eatPunct('}');
    return this.nodeFrom(startIdx, 'Block', members);
  }

  private parseSwitch(): TSNode {
    const startIdx = this._pos;
    this.expect('switch');
    this.expect('(');
    const disc = this.parseExpression();
    this.expect(')');
    this.expect('{');
    const cases: TSNode[] = [];
    while (!this.at('punct', '}') && !this.at('eof')) {
      const cStart = this._pos;
      if (this.eat('keyword', 'case')) {
        const test = this.parseExpression();
        this.expect(':');
        if (test) cases.push(test);
      } else if (this.eat('keyword', 'default')) {
        this.expect(':');
      } else {
        const s = this.parseStatement();
        if (s) cases.push(s);
        if (this._pos === cStart) this.next();
      }
    }
    this.eatPunct('}');
    return this.nodeFrom(
      startIdx,
      'SwitchStatement',
      [disc, ...cases].filter((n): n is TSNode => n !== undefined)
    );
  }

  private parseTry(): TSNode {
    const startIdx = this._pos;
    this.expect('try');
    const block = this.parseBlock();
    const parts: TSNode[] = [block];
    if (this.eat('keyword', 'catch')) {
      if (this.at('punct', '(')) this.skipBalanced();
      parts.push(this.parseBlock());
    }
    if (this.eat('keyword', 'finally')) {
      parts.push(this.parseBlock());
    }
    return this.nodeFrom(startIdx, 'TryStatement', parts);
  }

  private parseImport(): TSNode {
    const start = this._pos;
    this.next(); // import
    while (!this.at('eof') && !this.at('punct', ';')) {
      if (this.at('string')) {
        this.next();
        break;
      }
      if (this.at('punct', '{') || this.at('punct', '[') || this.at('punct', '(')) {
        this.skipBalanced();
      } else {
        this.next();
      }
    }
    this.eatPunct(';');
    return this.rawFrom(start);
  }

  private parseExport(): TSNode {
    const startIdx = this._pos;
    this.next(); // export
    if (this.eat('keyword', 'default')) {
      if (this.at('keyword', 'function')) {
        return this.nodeFrom(startIdx, 'ExportDecl', [this.parseFunctionDecl(false)]);
      }
      if (this.at('keyword', 'class')) {
        return this.nodeFrom(startIdx, 'ExportDecl', [this.parseClassDecl()]);
      }
      const e = this.parseExpression();
      this.eatPunct(';');
      return this.nodeFrom(startIdx, 'ExportDecl', e ? [e] : []);
    }
    const inner = this.parseStatement();
    return this.nodeFrom(startIdx, 'ExportDecl', inner ? [inner] : []);
  }

  /* ---------------- expressions ---------------- */

  /**
   * Precedence-climbing expression parser: binds operators whose
   * precedence is >= minPrec, then handles assignment/ternary at the
   * lowest level (minPrec 0 only).
   */
  parseExpression(minPrec = 0): TSNode | undefined {
    let left = this.parseUnary();
    if (!left) return undefined;

    for (;;) {
      const t = this.peek();
      if (t.value === '?' && t.kind === 'punct' && minPrec <= 0) {
        this.next();
        const cons = this.parseExpression(0);
        this.expect(':');
        const alt = this.parseExpression(0);
        left = {
          kind: 'ConditionalExpr',
          tokenStart: left.tokenStart,
          tokenEnd: this._pos,
          start: left.start,
          end: alt?.end ?? left.end,
          line: left.line,
          column: left.column,
          children: [left, cons, alt].filter((n): n is TSNode => n !== undefined),
        };
        continue;
      }
      if (ASSIGNMENT_OPS.has(t.value) && t.kind === 'punct' && minPrec <= 0) {
        this.next();
        const rhs = this.parseExpression(0);
        if (!rhs) return left;
        left = {
          kind: 'AssignmentExpr',
          tokenStart: left.tokenStart,
          tokenEnd: this._pos,
          start: left.start,
          end: rhs.end,
          line: left.line,
          column: left.column,
          children: [left, rhs],
          data: { operator: t.value },
        };
        continue;
      }
      const prec = this.binaryPrecedence(t);
      if (prec === 0 || prec < minPrec) break;
      this.next();
      const nextMin = RIGHT_ASSOC.has(t.value) ? prec : prec + 1;
      const right = this.parseExpression(nextMin);
      if (!right) return left;
      const isLogical = t.value === '&&' || t.value === '||' || t.value === '??';
      left = {
        kind: isLogical ? 'LogicalExpr' : 'BinaryExpr',
        tokenStart: left.tokenStart,
        tokenEnd: this._pos,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
        children: [left, right],
        data: { operator: t.value },
      };
    }
    return left;
  }

  private binaryPrecedence(t: Token): number {
    if (t.kind === 'keyword' && (t.value === 'instanceof' || t.value === 'in')) {
      return BINARY_PRECEDENCE[t.value] ?? 0;
    }
    if (t.kind !== 'punct') return 0;
    return BINARY_PRECEDENCE[t.value] ?? 0;
  }

  private parseUnary(): TSNode | undefined {
    const t = this.peek();
    const startIdx = this._pos;

    if (t.kind === 'punct' && ['!', '~', '+', '-', '++', '--'].includes(t.value)) {
      this.next();
      const operand = this.parseUnary();
      if (!operand) return this.rawFrom(startIdx);
      return {
        kind: t.value === '++' || t.value === '--' ? 'UpdateExpr' : 'UnaryExpr',
        tokenStart: startIdx,
        tokenEnd: this._pos,
        start: t.start,
        end: operand.end,
        line: t.line,
        column: t.column,
        children: [operand],
        data: { operator: t.value, prefix: true },
      };
    }
    if (t.kind === 'keyword' && ['typeof', 'void', 'delete', 'await'].includes(t.value)) {
      this.next();
      const operand = this.parseUnary();
      if (!operand) return this.rawFrom(startIdx);
      return {
        kind: t.value === 'await' ? 'AwaitExpr' : 'UnaryExpr',
        tokenStart: startIdx,
        tokenEnd: this._pos,
        start: t.start,
        end: operand.end,
        line: t.line,
        column: t.column,
        children: [operand],
        data: { operator: t.value, prefix: true },
      };
    }
    if (t.kind === 'keyword' && t.value === 'new') {
      this.next();
      const callee = this.parsePostfix(this.parsePrimary());
      return {
        kind: 'NewExpr',
        tokenStart: startIdx,
        tokenEnd: this._pos,
        start: t.start,
        end: callee?.end ?? t.end,
        line: t.line,
        column: t.column,
        children: callee ? [callee] : [],
      };
    }

    const primary = this.parsePrimary();
    if (!primary) return undefined;
    return this.parsePostfix(primary);
  }

  private parsePostfix(expr: TSNode | undefined): TSNode | undefined {
    let node = expr;
    while (node) {
      const t = this.peek();
      if (t.value === '(' && t.kind === 'punct') {
        this.next();
        const args: TSNode[] = [];
        while (!this.at('punct', ')') && !this.at('eof')) {
          if (this.at('punct', '...')) {
            const sIdx = this._pos;
            this.next();
            const inner = this.parseExpression(0);
            args.push({
              kind: 'SpreadExpr',
              tokenStart: sIdx,
              tokenEnd: this._pos,
              start: this._tokens[sIdx].start,
              end: inner?.end ?? this._tokens[sIdx].end,
              line: this._tokens[sIdx].line,
              column: this._tokens[sIdx].column,
              children: inner ? [inner] : [],
            });
          } else {
            const a = this.parseExpression(0);
            if (a) args.push(a);
          }
          if (!this.eatPunct(',')) break;
        }
        this.eatPunct(')');
        node = {
          kind: 'CallExpr',
          tokenStart: node.tokenStart,
          tokenEnd: this._pos,
          start: node.start,
          end: this._tokens[this._pos - 1]?.end ?? node.end,
          line: node.line,
          column: node.column,
          children: [node, ...args],
        };
        continue;
      }
      if ((t.value === '.' || t.value === '?.') && t.kind === 'punct') {
        this.next();
        const nameTok = this.eat('identifier') ?? this.eat('keyword');
        node = {
          kind: 'MemberExpr',
          tokenStart: node.tokenStart,
          tokenEnd: this._pos,
          start: node.start,
          end: nameTok?.end ?? t.end,
          line: node.line,
          column: node.column,
          children: [node],
          data: { name: nameTok?.value, operator: t.value },
        };
        continue;
      }
      if (t.value === '[' && t.kind === 'punct') {
        this.next();
        const idx = this.parseExpression(0);
        this.eatPunct(']');
        node = {
          kind: 'IndexExpr',
          tokenStart: node.tokenStart,
          tokenEnd: this._pos,
          start: node.start,
          end: this._tokens[this._pos - 1]?.end ?? node.end,
          line: node.line,
          column: node.column,
          children: idx ? [node, idx] : [node],
        };
        continue;
      }
      if ((t.value === '++' || t.value === '--') && t.kind === 'punct') {
        this.next();
        node = {
          kind: 'UpdateExpr',
          tokenStart: node.tokenStart,
          tokenEnd: this._pos,
          start: node.start,
          end: t.end,
          line: node.line,
          column: node.column,
          children: [node],
          data: { operator: t.value, prefix: false },
        };
        continue;
      }
      if (
        (t.kind === 'identifier' && (t.value === 'as' || t.value === 'satisfies')) ||
        (t.kind === 'keyword' && t.value === 'as')
      ) {
        this.next();
        this.skipTypeAnnotation();
        continue;
      }
      break;
    }
    return node;
  }

  private parsePrimary(): TSNode | undefined {
    const t = this.peek();
    const startIdx = this._pos;

    const literal = (
      literalType: NonNullable<TSNode['data']>['literalType'],
      literalValue: string
    ): TSNode => ({
      kind: 'Literal',
      tokenStart: startIdx,
      tokenEnd: this._pos,
      start: t.start,
      end: t.end,
      line: t.line,
      column: t.column,
      children: [],
      data: { literalType, literalValue },
    });

    const ident = (name: string): TSNode => ({
      kind: 'Identifier',
      tokenStart: startIdx,
      tokenEnd: this._pos,
      start: t.start,
      end: t.end,
      line: t.line,
      column: t.column,
      children: [],
      data: { name },
    });

    switch (t.kind) {
      case 'number':
        this.next();
        return literal('number', t.value);
      case 'string':
        this.next();
        return literal('string', t.value);
      case 'template':
        this.next();
        return literal('template', t.value);
      case 'regex':
        this.next();
        return literal('regex', t.value);
      case 'keyword': {
        if (t.value === 'true' || t.value === 'false') {
          this.next();
          return literal('boolean', t.value);
        }
        if (t.value === 'null' || t.value === 'undefined') {
          this.next();
          return literal(t.value, t.value);
        }
        if (t.value === 'this' || t.value === 'super') {
          this.next();
          return ident(t.value);
        }
        if (t.value === 'function') return this.parseFunctionDecl(false);
        if (t.value === 'async' && this._tokens[this._pos + 1]?.value === 'function') {
          return this.parseFunctionDecl(true);
        }
        if (t.value === 'class') return this.parseClassDecl();
        this.next();
        return ident(t.value); // contextual keyword as identifier
      }
      case 'identifier': {
        if (this._tokens[this._pos + 1]?.value === '=>') {
          this.next(); // param name
          this.next(); // =>
          const body = this.at('punct', '{') ? this.parseBlock() : this.parseExpression(0);
          return {
            kind: 'ArrowFunction',
            tokenStart: startIdx,
            tokenEnd: this._pos,
            start: t.start,
            end: body?.end ?? t.end,
            line: t.line,
            column: t.column,
            children: body ? [body] : [],
          };
        }
        this.next();
        return ident(t.value);
      }
      case 'punct': {
        if (t.value === '(') {
          if (this.scanArrowStart() !== undefined) {
            this.skipBalanced(); // params
            this.expect('=>');
            const body = this.at('punct', '{') ? this.parseBlock() : this.parseExpression(0);
            return {
              kind: 'ArrowFunction',
              tokenStart: startIdx,
              tokenEnd: this._pos,
              start: t.start,
              end: body?.end ?? t.end,
              line: t.line,
              column: t.column,
              children: body ? [body] : [],
            };
          }
          this.next();
          const inner = this.parseExpression(0);
          this.eatPunct(')');
          if (!inner) return this.rawFrom(startIdx);
          return {
            kind: 'ParenExpr',
            tokenStart: startIdx,
            tokenEnd: this._pos,
            start: t.start,
            end: this._tokens[this._pos - 1]?.end ?? t.end,
            line: t.line,
            column: t.column,
            children: [inner],
          };
        }
        if (t.value === '[') {
          this.next();
          const els: TSNode[] = [];
          while (!this.at('punct', ']') && !this.at('eof')) {
            if (this.at('punct', '...')) {
              const sIdx = this._pos;
              this.next();
              const inner = this.parseExpression(0);
              els.push({
                kind: 'SpreadExpr',
                tokenStart: sIdx,
                tokenEnd: this._pos,
                start: this._tokens[sIdx].start,
                end: inner?.end ?? this._tokens[sIdx].end,
                line: this._tokens[sIdx].line,
                column: this._tokens[sIdx].column,
                children: inner ? [inner] : [],
              });
            } else {
              const e = this.parseExpression(0);
              if (e) els.push(e);
            }
            if (!this.eatPunct(',')) break;
            if (this.at('punct', ']')) break;
          }
          this.eatPunct(']');
          return {
            kind: 'ArrayLiteral',
            tokenStart: startIdx,
            tokenEnd: this._pos,
            start: t.start,
            end: this._tokens[this._pos - 1]?.end ?? t.end,
            line: t.line,
            column: t.column,
            children: els,
          };
        }
        if (t.value === '{') {
          this.next();
          const props: TSNode[] = [];
          while (!this.at('punct', '}') && !this.at('eof')) {
            const pStart = this._pos;
            if (this.at('punct', '...')) {
              this.next();
              const inner = this.parseExpression(0);
              props.push({
                kind: 'SpreadExpr',
                tokenStart: pStart,
                tokenEnd: this._pos,
                start: this._tokens[pStart].start,
                end: inner?.end ?? this._tokens[pStart].end,
                line: this._tokens[pStart].line,
                column: this._tokens[pStart].column,
                children: inner ? [inner] : [],
              });
            } else {
              if (
                this.at('identifier') ||
                this.at('keyword') ||
                this.at('string') ||
                this.at('number')
              ) {
                this.next();
              } else if (this.at('punct', '[')) {
                this.skipBalanced();
              }
              if (this.eatPunct(':')) {
                const v = this.parseExpression(0);
                if (v) props.push(v);
              } else if (this.at('punct', '(')) {
                this.skipBalanced();
                if (this.at('punct', '{')) {
                  props.push(this.parseBlock());
                }
              } else {
                props.push(this.rawFrom(pStart));
              }
            }
            if (!this.eatPunct(',')) break;
            if (this.at('punct', '}')) break;
          }
          this.eatPunct('}');
          return {
            kind: 'ObjectLiteral',
            tokenStart: startIdx,
            tokenEnd: this._pos,
            start: t.start,
            end: this._tokens[this._pos - 1]?.end ?? t.end,
            line: t.line,
            column: t.column,
            children: props,
          };
        }
        return undefined;
      }
      case 'eof':
        return undefined;
    }
  }

  /**
   * Look ahead: does the '(' at cursor open an arrow parameter list?
   * True when the matching ')' is followed by '=>' (possibly after a
   * return-type annotation).
   */
  private scanArrowStart(): number | undefined {
    let depth = 0;
    let i = this._pos;
    for (; i < this._tokens.length; i++) {
      const v = this._tokens[i].value;
      if (v === '(') depth++;
      else if (v === ')') {
        depth--;
        if (depth === 0) break;
      }
      if (this._tokens[i].kind === 'eof') return undefined;
    }
    let j = i + 1;
    if (this._tokens[j]?.value === ':') {
      j++;
      let d = 0;
      for (; j < this._tokens.length; j++) {
        const v = this._tokens[j].value;
        if (v === '(' || v === '[' || v === '{' || v === '<') d++;
        else if (v === ')' || v === ']' || v === '}' || v === '>') d--;
        else if (v === '=>' && d === 0) return j;
        if ((v === ';' || v === ',') && d === 0) return undefined;
      }
      return undefined;
    }
    return this._tokens[j]?.value === '=>' ? j : undefined;
  }

  /* ---------------- skipping helpers ---------------- */

  /** Skip a balanced-bracket construct starting at cursor. */
  private skipBalanced(): void {
    const open = this.next();
    const close =
      open.value === '(' ? ')' : open.value === '[' ? ']' : open.value === '<' ? '>' : '}';
    let depth = 1;
    while (depth > 0 && !this.at('eof')) {
      const v = this.next().value;
      if (v === open.value) depth++;
      else if (v === close) depth--;
    }
  }

  /** Skip a generic-parameter angle bracket run after '<'. */
  private skipAngle(): void {
    let depth = 1;
    while (depth > 0 && !this.at('eof')) {
      const v = this.next().value;
      if (v === '<') depth++;
      else if (v === '>') depth--;
      else if (v === '>>') depth -= 2;
    }
  }

  /** Skip a type annotation until a token that ends it at depth 0. */
  private skipTypeAnnotation(): void {
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.kind === 'eof') return;
      const v = t.value;
      if (depth === 0 && ['=', ')', ']', '}', ';', ',', '=>', 'return', '{'].includes(v)) {
        return;
      }
      if (['(', '[', '{', '<'].includes(v)) depth++;
      if ([')', ']', '}', '>'].includes(v)) {
        if (depth === 0) return;
        depth--;
      }
      this.next();
    }
  }

  /** Skip interface/type/enum/namespace/declare declarations. */
  private skipTypeConstruct(): void {
    for (;;) {
      const t = this.peek();
      if (t.kind === 'eof') return;
      if (t.value === '{') {
        this.skipBalanced();
        return;
      }
      if (t.value === ';') {
        this.next();
        return;
      }
      if (t.value === '=') {
        while (!this.at('eof') && !this.at('punct', ';')) {
          if (
            this.at('punct', '(') ||
            this.at('punct', '[') ||
            this.at('punct', '{')
          ) {
            this.skipBalanced();
          } else {
            this.next();
          }
        }
        this.eatPunct(';');
        return;
      }
      this.next();
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Traversal                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Depth-first pre-order traversal. `visit` may return `false` to skip a
 * node's children.
 */
export function walk(node: TSNode, visit: (n: TSNode) => boolean | void): void {
  const descend = visit(node);
  if (descend === false) return;
  for (const child of node.children) walk(child, visit);
}

/** Collect all nodes of the given kinds in source order. */
export function findNodes(program: TUProgram, kinds: ReadonlySet<NodeKind>): readonly TSNode[] {
  const out: TSNode[] = [];
  for (const top of program.body) {
    walk(top, (n) => {
      if (kinds.has(n.kind)) out.push(n);
      return true;
    });
  }
  return out;
}

/** Emit source text spanned by a node. */
export function emitNode(program: TUProgram, node: TSNode): string {
  return program.source.slice(node.start, node.end);
}
