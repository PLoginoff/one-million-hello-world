/**
 * Lexer
 *
 * Tokenizer for the GraphQL query language (per the Oct 2021 spec
 * lexical grammar, minus schema-definition extensions we don't need).
 * Produces a flat token stream consumed by the parser.
 */

export enum TokenKind {
  // punctuation
  BANG = 'BANG',
  DOLLAR = 'DOLLAR',
  AMP = 'AMP',
  PAREN_L = 'PAREN_L',
  PAREN_R = 'PAREN_R',
  SPREAD = 'SPREAD',
  COLON = 'COLON',
  EQ = 'EQ',
  AT = 'AT',
  BRACKET_L = 'BRACKET_L',
  BRACKET_R = 'BRACKET_R',
  BRACE_L = 'BRACE_L',
  PIPE = 'PIPE',
  BRACE_R = 'BRACE_R',
  // literals
  NAME = 'NAME',
  INT = 'INT',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  BLOCK_STRING = 'BLOCK_STRING',
  // control
  EOF = 'EOF',
}

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export class GraphQLSyntaxError extends Error {
  readonly line: number;
  readonly column: number;
  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'GraphQLSyntaxError';
    this.line = line;
    this.column = column;
  }
}

const PUNCTUATORS: ReadonlyMap<string, TokenKind> = new Map([
  ['!', TokenKind.BANG],
  ['$', TokenKind.DOLLAR],
  ['&', TokenKind.AMP],
  ['(', TokenKind.PAREN_L],
  [')', TokenKind.PAREN_R],
  [':', TokenKind.COLON],
  ['=', TokenKind.EQ],
  ['@', TokenKind.AT],
  ['[', TokenKind.BRACKET_L],
  [']', TokenKind.BRACKET_R],
  ['{', TokenKind.BRACE_L],
  ['|', TokenKind.PIPE],
  ['}', TokenKind.BRACE_R],
]);

const NAME_START = /[_A-Za-z]/;
const NAME_CONTINUE = /[_0-9A-Za-z]/;
const DIGIT = /[0-9]/;

export class Lexer {
  private readonly source: string;
  private pos = 0;
  private line = 1;
  private lineStart = 0;

  constructor(source: string) {
    this.source = source;
  }

  private column(): number {
    return this.pos - this.lineStart + 1;
  }

  private error(message: string): GraphQLSyntaxError {
    return new GraphQLSyntaxError(message, this.line, this.column());
  }

  private advance(): string {
    const ch = this.source[this.pos];
    if (ch === '\n') {
      this.line++;
      this.lineStart = this.pos + 1;
    }
    this.pos++;
    return ch;
  }

  private skipIgnored(): void {
    for (;;) {
      if (this.pos >= this.source.length) return;
      const ch = this.source[this.pos];
      if (ch === ',' || ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '﻿') {
        this.advance();
        continue;
      }
      if (ch === '#') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance();
        }
        continue;
      }
      return;
    }
  }

  /** Read all tokens up to EOF. */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    for (;;) {
      const t = this.nextToken();
      tokens.push(t);
      if (t.kind === TokenKind.EOF) break;
    }
    return tokens;
  }

  nextToken(): Token {
    this.skipIgnored();
    const offset = this.pos;
    const line = this.line;
    const column = this.column();
    if (this.pos >= this.source.length) {
      return { kind: TokenKind.EOF, value: '', line, column, offset };
    }
    const ch = this.source[this.pos];
    // spread
    if (ch === '.') {
      if (
        this.source[this.pos + 1] === '.' &&
        this.source[this.pos + 2] === '.'
      ) {
        this.pos += 3;
        return { kind: TokenKind.SPREAD, value: '...', line, column, offset };
      }
      throw this.error("Unexpected '.', did you mean '...'?");
    }
    const punct = PUNCTUATORS.get(ch);
    if (punct !== undefined) {
      this.advance();
      return { kind: punct, value: ch, line, column, offset };
    }
    if (NAME_START.test(ch)) {
      return this.readName(line, column, offset);
    }
    if (ch === '-' || DIGIT.test(ch)) {
      return this.readNumber(line, column, offset);
    }
    if (ch === '"') {
      if (this.source.slice(this.pos, this.pos + 3) === '"""') {
        return this.readBlockString(line, column, offset);
      }
      return this.readString(line, column, offset);
    }
    throw this.error(`Unexpected character '${ch}'`);
  }

  private readName(line: number, column: number, offset: number): Token {
    const start = this.pos;
    while (
      this.pos < this.source.length &&
      NAME_CONTINUE.test(this.source[this.pos])
    ) {
      this.pos++;
    }
    return {
      kind: TokenKind.NAME,
      value: this.source.slice(start, this.pos),
      line,
      column,
      offset,
    };
  }

  private readNumber(line: number, column: number, offset: number): Token {
    const start = this.pos;
    let isFloat = false;
    if (this.source[this.pos] === '-') this.pos++;
    if (this.pos >= this.source.length) throw this.error('Invalid number');
    if (this.source[this.pos] === '0') {
      this.pos++;
      if (DIGIT.test(this.source[this.pos] ?? '')) {
        throw this.error('Invalid number: unexpected digit after 0');
      }
    } else {
      while (DIGIT.test(this.source[this.pos] ?? '')) this.pos++;
    }
    if (this.source[this.pos] === '.') {
      isFloat = true;
      this.pos++;
      if (!DIGIT.test(this.source[this.pos] ?? '')) {
        throw this.error('Invalid float: expected digit after decimal point');
      }
      while (DIGIT.test(this.source[this.pos] ?? '')) this.pos++;
    }
    if (this.source[this.pos] === 'e' || this.source[this.pos] === 'E') {
      isFloat = true;
      this.pos++;
      if (this.source[this.pos] === '+' || this.source[this.pos] === '-') this.pos++;
      if (!DIGIT.test(this.source[this.pos] ?? '')) {
        throw this.error('Invalid float: expected exponent digit');
      }
      while (DIGIT.test(this.source[this.pos] ?? '')) this.pos++;
    }
    if (NAME_START.test(this.source[this.pos] ?? '')) {
      throw this.error('Invalid number: unexpected name character');
    }
    return {
      kind: isFloat ? TokenKind.FLOAT : TokenKind.INT,
      value: this.source.slice(start, this.pos),
      line,
      column,
      offset,
    };
  }

  private readString(line: number, column: number, offset: number): Token {
    this.pos++; // opening quote
    let value = '';
    for (;;) {
      if (this.pos >= this.source.length) throw this.error('Unterminated string');
      const ch = this.source[this.pos];
      if (ch === '"') {
        this.pos++;
        return { kind: TokenKind.STRING, value, line, column, offset };
      }
      if (ch === '\n' || ch === '\r') throw this.error('Unterminated string');
      if (ch === '\\') {
        this.pos++;
        const esc = this.source[this.pos];
        switch (esc) {
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          case '/': value += '/'; break;
          case 'b': value += '\b'; break;
          case 'f': value += '\f'; break;
          case 'n': value += '\n'; break;
          case 'r': value += '\r'; break;
          case 't': value += '\t'; break;
          case 'u': {
            const hex = this.source.slice(this.pos + 1, this.pos + 5);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
              throw this.error('Invalid unicode escape');
            }
            value += String.fromCharCode(parseInt(hex, 16));
            this.pos += 4;
            break;
          }
          default:
            throw this.error(`Invalid escape '\\${esc}'`);
        }
        this.pos++;
        continue;
      }
      value += ch;
      this.pos++;
    }
  }

  private readBlockString(line: number, column: number, offset: number): Token {
    this.pos += 3; // opening """
    let raw = '';
    for (;;) {
      if (this.pos >= this.source.length) throw this.error('Unterminated block string');
      if (this.source.slice(this.pos, this.pos + 3) === '"""') {
        this.pos += 3;
        break;
      }
      if (this.source.slice(this.pos, this.pos + 4) === '\\"""') {
        raw += '"""';
        this.pos += 4;
        continue;
      }
      raw += this.advance();
    }
    // dedent: common indentation of non-first lines is stripped per spec
    const lines = raw.split('\n');
    let indent = Infinity;
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      const stripped = l.replace(/^[ \t]+/, '');
      if (stripped.length > 0) {
        indent = Math.min(indent, l.length - stripped.length);
      }
    }
    if (indent !== Infinity && indent > 0) {
      for (let i = 1; i < lines.length; i++) {
        lines[i] = lines[i].slice(Math.min(indent, lines[i].length));
      }
    }
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return {
      kind: TokenKind.BLOCK_STRING,
      value: lines.join('\n'),
      line,
      column,
      offset,
    };
  }
}
