/**
 * SqlDialects — identifier quoting, parameter markers, and literal
 * escaping per SQL flavor.
 *
 * The `SqlGenerator` walks the criteria tree and emits fragments; all
 * dialect-specific surface details are isolated behind this interface
 * so adding a backend is a data change, not a code change.
 *
 * Escaping rules implemented here:
 *   - identifiers: wrapped in the dialect's quote pair after splitting
 *     on `.` (`a.b` → `"a"."b"`); embedded quote chars are doubled,
 *     which is the SQL-standard escape.
 *   - string literals (for `toInlineSql`): single quotes doubled.
 *   - `LIKE` patterns: `%`, `_`, and the escape char itself are
 *     backslash-escaped and `ESCAPE '\\'` appended.
 *
 * @module QueryObject/Engines
 */

import { SqlDialect } from './types';

/**
 * Dialect contract consumed by SqlGenerator.
 *
 * `param(n)` returns the placeholder for the n-th bind parameter
 * (1-indexed): `?` for mysql/sqlite/ansi positional style, `$n` for
 * postgres, `@p{n}` for mssql.
 */
export interface ISqlDialect {
  readonly name: SqlDialect;
  quoteIdent(part: string): string;
  param(n: number): string;
  /** Keyword for case-insensitive LIKE (postgres uses ILIKE). */
  likeKeyword(caseInsensitive: boolean): string;
  /** Render LIMIT/OFFSET clause suffix; null omits it. */
  limitOffset(limit: number | null, offset: number | null): string;
  /** Regex match operator, or null if the dialect lacks one (falls back to LIKE-less error). */
  regexOp: string | null;
}

function doublingEscape(s: string, quote: string): string {
  return s.split(quote).join(quote + quote);
}

const ansi: ISqlDialect = {
  name: 'ansi',
  quoteIdent: (p) => `"${doublingEscape(p, '"')}"`,
  param: () => '?',
  likeKeyword: (ci) => (ci ? 'ILIKE' : 'LIKE'),
  limitOffset: (limit, offset) => {
    let s = '';
    if (limit !== null) s += ` LIMIT ${limit}`;
    if (offset !== null) s += ` OFFSET ${offset}`;
    return s;
  },
  regexOp: null,
};

const postgres: ISqlDialect = {
  name: 'postgres',
  quoteIdent: ansi.quoteIdent,
  param: (n) => `$${n}`,
  likeKeyword: (ci) => (ci ? 'ILIKE' : 'LIKE'),
  limitOffset: ansi.limitOffset,
  regexOp: '~',
};

const mysql: ISqlDialect = {
  name: 'mysql',
  quoteIdent: (p) => '`' + doublingEscape(p, '`') + '`',
  param: () => '?',
  likeKeyword: () => 'LIKE',
  limitOffset: ansi.limitOffset,
  regexOp: 'REGEXP',
};

const sqlite: ISqlDialect = {
  name: 'sqlite',
  quoteIdent: ansi.quoteIdent,
  param: () => '?',
  likeKeyword: () => 'LIKE',
  limitOffset: ansi.limitOffset,
  regexOp: null,
};

const mssql: ISqlDialect = {
  name: 'mssql',
  quoteIdent: (p) => `[${p.split(']').join(']]')}]`,
  param: (n) => `@p${n}`,
  likeKeyword: () => 'LIKE',
  // T-SQL: OFFSET requires ORDER BY and FETCH is only valid with OFFSET.
  limitOffset: (limit, offset) => {
    if (offset === null && limit === null) return '';
    const off = offset ?? 0;
    let s = ` OFFSET ${off} ROWS`;
    if (limit !== null) s += ` FETCH NEXT ${limit} ROWS ONLY`;
    return s;
  },
  regexOp: null,
};

const DIALECTS: Record<SqlDialect, ISqlDialect> = { ansi, postgres, mysql, sqlite, mssql };

/** Look up a dialect by name. */
export function dialect(name: SqlDialect): ISqlDialect {
  return DIALECTS[name];
}

/** Quote a possibly-dotted identifier: `a.b` → `"a"."b"`. */
export function quotePath(d: ISqlDialect, path: string): string {
  return path
    .split('.')
    .map((p) => d.quoteIdent(p))
    .join('.');
}

/**
 * Escape a `LIKE` pattern's literal text: `%`, `_` and `\` become
 * `\%`, `\_`, `\\`. Callers append the wildcards they want around the
 * escaped core and finish with `ESCAPE '\\'`.
 */
export function escapeLike(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '%' || ch === '_' || ch === '\\') {
      out += '\\';
    }
    out += ch;
  }
  return out;
}

/**
 * Escape a single-quoted SQL string literal (for `toInlineSql`):
 * quotes doubled. Used only by the inline debug renderer — real
 * execution always goes through bound parameters.
 */
export function escapeLiteral(text: string): string {
  return text.split("'").join("''");
}
