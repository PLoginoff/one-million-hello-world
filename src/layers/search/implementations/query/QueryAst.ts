/**
 * QueryAst
 *
 * Abstract syntax tree nodes for the search query language, plus a
 * recursive-descent parser producing them.
 *
 * Grammar (informal):
 *   query    := orExpr
 *   orExpr   := andExpr (OR andExpr)*
 *   andExpr  := notExpr ((AND)? notExpr)*     // implicit AND
 *   notExpr  := NOT notExpr | primary
 *   primary  := '(' query ')' | phrase | fieldClause | term
 *   fieldClause := IDENT ':' (term | phrase | '(' query ')')
 *   phrase   := '"' ... '"' ['~' slop]
 *   term     := IDENT ['~' fuzz] ['^' boost]
 *   boost    := '^' NUMBER
 */

export type QueryNode =
  | TermQuery
  | PhraseQuery
  | BooleanQuery
  | FieldQuery
  | MatchAllQuery;

export interface TermQuery {
  readonly kind: 'term';
  readonly term: string;
  /** max edit distance for fuzzy matching; 0 = exact */
  readonly fuzziness: number;
  readonly boost: number;
}

export interface PhraseQuery {
  readonly kind: 'phrase';
  readonly terms: readonly string[];
  /** allowed positional slack (0 = exact phrase) */
  readonly slop: number;
  readonly boost: number;
}

export type BooleanClauseOccur = 'must' | 'should' | 'must_not';

export interface BooleanClause {
  readonly occur: BooleanClauseOccur;
  readonly query: QueryNode;
}

export interface BooleanQuery {
  readonly kind: 'boolean';
  readonly clauses: readonly BooleanClause[];
  readonly boost: number;
}

export interface FieldQuery {
  readonly kind: 'field';
  readonly field: string;
  readonly query: QueryNode;
}

export interface MatchAllQuery {
  readonly kind: 'match_all';
  readonly boost: number;
}

export function termQuery(term: string, fuzziness = 0, boost = 1): TermQuery {
  return { kind: 'term', term, fuzziness, boost };
}

export function phraseQuery(terms: readonly string[], slop = 0, boost = 1): PhraseQuery {
  return { kind: 'phrase', terms, slop, boost };
}

export function booleanQuery(clauses: readonly BooleanClause[], boost = 1): BooleanQuery {
  return { kind: 'boolean', clauses, boost };
}

export function fieldQuery(field: string, query: QueryNode): FieldQuery {
  return { kind: 'field', field, query };
}

export function matchAllQuery(boost = 1): MatchAllQuery {
  return { kind: 'match_all', boost };
}

export class QueryParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'QueryParseError';
    this.position = position;
  }
}

interface LexToken {
  readonly type:
    | 'term'
    | 'phrase'
    | 'and'
    | 'or'
    | 'not'
    | 'colon'
    | 'lparen'
    | 'rparen'
    | 'boost'
    | 'tilde'
    | 'eof';
  readonly value: string;
  readonly position: number;
}

function lex(input: string): LexToken[] {
  const tokens: LexToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', position: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', position: i });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', position: i });
      i++;
      continue;
    }
    if (ch === '^') {
      i++;
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'boost', value: num === '' ? '1' : num, position: i });
      continue;
    }
    if (ch === '~') {
      i++;
      let num = '';
      while (i < input.length && /[0-9]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'tilde', value: num, position: i });
      continue;
    }
    if (ch === '"') {
      const start = i;
      i++;
      let phrase = '';
      while (i < input.length && input[i] !== '"') {
        phrase += input[i];
        i++;
      }
      if (i >= input.length) {
        throw new QueryParseError('Unterminated phrase', start);
      }
      i++; // closing quote
      tokens.push({ type: 'phrase', value: phrase, position: start });
      continue;
    }
    if (ch === '+') {
      tokens.push({ type: 'and', value: ch, position: i });
      i++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ type: 'not', value: ch, position: i });
      i++;
      continue;
    }
    // bare word
    const start = i;
    let word = '';
    while (i < input.length && !/[\s():^~"+-]/.test(input[i])) {
      word += input[i];
      i++;
    }
    const upper = word.toUpperCase();
    if (upper === 'AND' || word === '&&') {
      tokens.push({ type: 'and', value: word, position: start });
    } else if (upper === 'OR' || word === '||') {
      tokens.push({ type: 'or', value: word, position: start });
    } else if (upper === 'NOT' || word === '!') {
      tokens.push({ type: 'not', value: word, position: start });
    } else {
      tokens.push({ type: 'term', value: word, position: start });
    }
  }
  tokens.push({ type: 'eof', value: '', position: input.length });
  return tokens;
}

export class QueryParser {
  private tokens: LexToken[] = [];
  private pos = 0;

  parse(input: string): QueryNode {
    const trimmed = input.trim();
    if (trimmed === '' || trimmed === '*:*' || trimmed === '*') {
      return matchAllQuery();
    }
    this.tokens = lex(trimmed);
    this.pos = 0;
    const node = this.parseOr();
    if (this.peek().type !== 'eof') {
      throw new QueryParseError(
        `Unexpected token '${this.peek().value}'`,
        this.peek().position
      );
    }
    return node;
  }

  private peek(): LexToken {
    return this.tokens[this.pos];
  }

  private next(): LexToken {
    return this.tokens[this.pos++];
  }

  private parseOr(): QueryNode {
    const clauses: BooleanClause[] = [];
    let sawOr = false;
    const first = this.parseAnd();
    if (first === null) {
      throw new QueryParseError('Expected query term', this.peek().position);
    }
    clauses.push(...this.toClauses(first));
    while (this.peek().type === 'or') {
      this.next();
      sawOr = true;
      const rhs = this.parseAnd();
      if (rhs === null) {
        throw new QueryParseError('Expected term after OR', this.peek().position);
      }
      clauses.push(...this.toClauses(rhs));
    }
    if (sawOr) {
      // OR query: all must clauses become 'should'; must_not stays
      return booleanQuery(
        clauses.map((c) =>
          c.occur === 'must' ? { ...c, occur: 'should' as const } : c
        )
      );
    }
    return clauses.length === 1 ? clauses[0].query : booleanQuery(clauses);
  }

  private toClauses(node: QueryNode): BooleanClause[] {
    if (node.kind === 'boolean') return [...node.clauses];
    return [{ occur: 'must', query: node }];
  }

  /** AND level: implicit conjunction, NOT prefix. Returns null if empty. */
  private parseAnd(): QueryNode | null {
    const clauses: BooleanClause[] = [];
    for (;;) {
      const t = this.peek();
      if (t.type === 'and') {
        this.next();
        continue;
      }
      if (t.type === 'not') {
        this.next();
        const inner = this.parsePrimary();
        if (inner === null) {
          throw new QueryParseError('Expected term after NOT', t.position);
        }
        clauses.push({ occur: 'must_not', query: inner });
        continue;
      }
      const primary = this.parsePrimary();
      if (primary === null) break;
      clauses.push({ occur: 'must', query: primary });
      if (
        this.peek().type === 'or' ||
        this.peek().type === 'rparen' ||
        this.peek().type === 'eof'
      ) {
        break;
      }
    }
    if (clauses.length === 0) return null;
    if (clauses.length === 1) return clauses[0].query;
    return booleanQuery(clauses);
  }

  private parsePrimary(): QueryNode | null {
    const t = this.peek();
    if (t.type === 'lparen') {
      this.next();
      const inner = this.parseOr();
      if (this.peek().type !== 'rparen') {
        throw new QueryParseError('Expected )', this.peek().position);
      }
      this.next();
      return this.applySuffix(inner);
    }
    if (t.type === 'phrase') {
      this.next();
      const terms = t.value.split(/\s+/).filter((s) => s.length > 0);
      const node: QueryNode = phraseQuery(terms, 0, 1);
      return this.applySuffix(node);
    }
    if (t.type === 'term') {
      this.next();
      if (this.peek().type === 'colon') {
        this.next();
        const inner = this.parsePrimary();
        if (inner === null) {
          throw new QueryParseError(
            `Expected value after field '${t.value}:'`,
            this.peek().position
          );
        }
        return fieldQuery(t.value, inner);
      }
      if (t.value === '*') {
        return matchAllQuery();
      }
      const node: QueryNode = termQuery(t.value.toLowerCase(), 0, 1);
      return this.applySuffix(node);
    }
    return null;
  }

  /** Apply ~fuzz/slop and ^boost suffixes to a node. */
  private applySuffix(node: QueryNode): QueryNode {
    let result = node;
    if (this.peek().type === 'tilde') {
      const t = this.next();
      const n = t.value === '' ? 2 : parseInt(t.value, 10);
      if (result.kind === 'term') {
        result = { ...result, fuzziness: n };
      } else if (result.kind === 'phrase') {
        result = { ...result, slop: n };
      }
    }
    if (this.peek().type === 'boost') {
      const t = this.next();
      const boost = parseFloat(t.value);
      if (
        result.kind === 'term' ||
        result.kind === 'phrase' ||
        result.kind === 'match_all' ||
        result.kind === 'boolean'
      ) {
        result = { ...result, boost };
      }
    }
    return result;
  }
}

export function parseQuery(input: string): QueryNode {
  return new QueryParser().parse(input);
}
