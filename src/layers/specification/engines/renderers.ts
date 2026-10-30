/**
 * Renderers — SpecLeaf → SQL fragment and English description.
 *
 * Leaf rendering is where parameter binding happens: every value goes
 * into the `params` array and a `?` placeholder is emitted, so SQL
 * fragments are injection-safe by construction (callers may remap `?`
 * to `$n`/`@pn` per dialect — see `remapPlaceholders`).
 *
 * English rendering follows the rule "operators read like prose":
 *   `age >= 18`, `status in ('a', 'b')`, `name contains 'x'`,
 *   `email matches /re/`, `age between 18 and 65`, `deletedAt is null`.
 *
 * @module Specification/Engines
 */

import { SpecLeaf, SpecOp } from './types';

/** Quote a possibly-dotted identifier with double quotes: `a.b` → `"a"."b"`. */
function quoteField(path: string): string {
  return path
    .split('.')
    .map((p) => `"${p.split('"').join('""')}"`)
    .join('.');
}

/** Escape `%`, `_`, `\` inside LIKE patterns. */
function escapeLike(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '%' || ch === '_' || ch === '\\') out += '\\';
    out += ch;
  }
  return out;
}

/**
 * Render a leaf node to a SQL fragment, pushing bind values into
 * `params`. Returns the fragment text with `?` placeholders.
 */
export function leafSql(node: SpecLeaf, params: unknown[]): string {
  const col = quoteField(node.field);
  switch (node.op) {
    case SpecOp.Eq:
      if (node.value === null || node.value === undefined) return `${col} IS NULL`;
      params.push(node.value);
      return `${col} = ?`;
    case SpecOp.Ne:
      if (node.value === null || node.value === undefined) return `${col} IS NOT NULL`;
      params.push(node.value);
      return `${col} <> ?`;
    case SpecOp.Gt:
      params.push(node.value);
      return `${col} > ?`;
    case SpecOp.Gte:
      params.push(node.value);
      return `${col} >= ?`;
    case SpecOp.Lt:
      params.push(node.value);
      return `${col} < ?`;
    case SpecOp.Lte:
      params.push(node.value);
      return `${col} <= ?`;
    case SpecOp.In:
    case SpecOp.NotIn: {
      const list = Array.isArray(node.value) ? (node.value as unknown[]) : [node.value];
      if (list.length === 0) return node.op === SpecOp.In ? '1 = 0' : '1 = 1';
      for (const v of list) params.push(v);
      const neg = node.op === SpecOp.NotIn ? 'NOT ' : '';
      return `${col} ${neg}IN (${list.map(() => '?').join(', ')})`;
    }
    case SpecOp.Between:
      params.push(node.value, node.value2);
      return `${col} BETWEEN ? AND ?`;
    case SpecOp.IsNull:
      return `${col} IS NULL`;
    case SpecOp.IsNotNull:
      return `${col} IS NOT NULL`;
    case SpecOp.Contains:
      params.push(`%${escapeLike(String(node.value))}%`);
      return `${col} LIKE ? ESCAPE '\\\\'`;
    case SpecOp.StartsWith:
      params.push(`${escapeLike(String(node.value))}%`);
      return `${col} LIKE ? ESCAPE '\\\\'`;
    case SpecOp.EndsWith:
      params.push(`%${escapeLike(String(node.value))}`);
      return `${col} LIKE ? ESCAPE '\\\\'`;
    case SpecOp.Matches: {
      const src =
        node.value instanceof RegExp
          ? node.value.source
          : typeof node.value === 'object' && node.value !== null && 'source' in node.value
            ? String((node.value as { source: unknown }).source)
            : String(node.value);
      params.push(src);
      // `~` is postgres regex match; callers targeting other dialects
      // can remap the operator alongside placeholders.
      return `${col} ~ ?`;
    }
  }
}

/**
 * Remap `?` placeholders to a numbered dialect style.
 * `numbered('postgres')` produces `$1, $2, ...`; `numbered('mssql')`
 * produces `@p1, @p2, ...`. The scan skips `?` characters inside
 * single-quoted literals so escaped text can't desync binds.
 */
export function remapPlaceholders(sql: string, style: 'postgres' | 'mssql'): string {
  let n = 0;
  let inString = false;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '?') {
      n += 1;
      out += style === 'postgres' ? `$${n}` : `@p${n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Render a leaf node to an English description. */
export function leafDescription(node: SpecLeaf): string {
  const f = node.field;
  const v = (x: unknown): string => {
    if (typeof x === 'string') return `'${x}'`;
    if (x instanceof Date) return `'${x.toISOString()}'`;
    return String(x);
  };
  switch (node.op) {
    case SpecOp.Eq: return `${f} = ${v(node.value)}`;
    case SpecOp.Ne: return `${f} ≠ ${v(node.value)}`;
    case SpecOp.Gt: return `${f} > ${v(node.value)}`;
    case SpecOp.Gte: return `${f} ≥ ${v(node.value)}`;
    case SpecOp.Lt: return `${f} < ${v(node.value)}`;
    case SpecOp.Lte: return `${f} ≤ ${v(node.value)}`;
    case SpecOp.In: {
      const list = Array.isArray(node.value) ? node.value : [node.value];
      return `${f} in (${(list as unknown[]).map(v).join(', ')})`;
    }
    case SpecOp.NotIn: {
      const list = Array.isArray(node.value) ? node.value : [node.value];
      return `${f} not in (${(list as unknown[]).map(v).join(', ')})`;
    }
    case SpecOp.Between: return `${f} between ${v(node.value)} and ${v(node.value2)}`;
    case SpecOp.IsNull: return `${f} is null`;
    case SpecOp.IsNotNull: return `${f} is not null`;
    case SpecOp.Contains: return `${f} contains ${v(node.value)}`;
    case SpecOp.StartsWith: return `${f} starts with ${v(node.value)}`;
    case SpecOp.EndsWith: return `${f} ends with ${v(node.value)}`;
    case SpecOp.Matches: {
      const src =
        node.value instanceof RegExp
          ? node.value.source
          : typeof node.value === 'object' && node.value !== null && 'source' in node.value
            ? String((node.value as { source: unknown }).source)
            : String(node.value);
      return `${f} matches /${src}/`;
    }
  }
}
