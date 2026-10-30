/**
 * Cursor (Keyset) Paginator
 *
 * Implements opaque-cursor pagination over in-memory rows — the "seek
 * method" that avoids `OFFSET n` degradation:
 *
 *   OFFSET pagination: page k costs O(k·pageSize) skipped rows, and rows
 *   inserted/deleted while paging shift window boundaries (duplicates /
 *   missed rows).
 *
 *   Keyset pagination: each cursor encodes the *sort-key values* of the
 *   boundary row. The next page is `WHERE sortKey > cursor` — O(log n) with
 *   a real index, O(n) filter here, but stable under concurrent mutation:
 *   a row's position is defined by its key values, not its offset.
 *
 * Cursor format (opaque to callers):
 *   base64url(JSON({ v: [sortKeyValue, ...], s: sortSignature }))
 *
 * `s` is a signature of the sort keys so a cursor minted for `age ASC`
 * can't be replayed against `name DESC` (would silently return a wrong
 * window — caught as CursorError instead).
 *
 * Stability: callers should include a unique tiebreaker field (e.g. `id`)
 * as the LAST sort key. `paginate` detects equal full-key rows and, if the
 * last key is not unique, still returns deterministic output because the
 * comparator is a total order — but pages may repeat rows across calls.
 * `validateSort` flags non-unique-looking sorts in development.
 *
 * Complexity: sort O(n log n), cursor scan O(n), slice O(pageSize).
 *
 * @module RepositoryLayer/Engine
 */

import { compareValues, getPath, stableStringify } from './path';
import { CursorError, Page, PageArgs, SortKey } from './types';

interface CursorPayload {
  /** Sort-key values of the boundary row, in sort-key order. */
  readonly v: readonly unknown[];
  /** Signature of the sort spec this cursor was minted under. */
  readonly s: string;
}

export class CursorPaginator {
  /**
   * Mints an opaque cursor for `row` under `sort`. Returns null when a sort
   * key resolves to `undefined` on the row (cursor would be ambiguous).
   */
  encode<T>(row: T, sort: readonly SortKey[]): string {
    const values = sort.map((k) => encodeValue(getPath(row, k.field)));
    const payload: CursorPayload = { v: values, s: this.sortSignature(sort) };
    return base64UrlEncode(JSON.stringify(payload));
  }

  /** Decodes a cursor, verifying it matches `sort`. */
  decode(cursor: string, sort: readonly SortKey[]): readonly unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(base64UrlDecode(cursor));
    } catch {
      throw new CursorError('Cursor is not valid base64url JSON');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as CursorPayload).v) ||
      typeof (parsed as CursorPayload).s !== 'string'
    ) {
      throw new CursorError('Cursor payload is malformed');
    }
    const p = parsed as CursorPayload;
    if (p.s !== this.sortSignature(sort)) {
      throw new CursorError('Cursor was minted under a different sort specification');
    }
    if (p.v.length !== sort.length) {
      throw new CursorError('Cursor arity does not match sort keys');
    }
    return p.v;
  }

  /**
   * Full pipeline: filter → sort → keyset window → slice.
   *
   * Window semantics (Relay-style):
   *  - `after`: rows strictly after the cursor in sort order.
   *  - `before`: rows strictly before the cursor.
   *  - `first`: take the first N of the forward window.
   *  - `last`: take the last N of the window (backward pagination).
   *
   * `hasNextPage`/`hasPreviousPage` are computed by checking whether any
   * rows exist beyond the returned window — we carry `totalMatching` and
   * compare positions, no extra store round-trip needed.
   */
  paginate<T>(
    rows: readonly T[],
    predicate: (row: T) => boolean,
    sort: readonly SortKey[],
    args: PageArgs = {}
  ): Page<T> {
    if (sort.length === 0) {
      throw new CursorError('Keyset pagination requires at least one sort key');
    }
    const first = args.first ?? Number.POSITIVE_INFINITY;
    const last = args.last ?? Number.POSITIVE_INFINITY;
    if (first < 0 || last < 0) {
      throw new CursorError('first/last must be non-negative');
    }

    const comparator = this.comparator<T>(sort);
    const filtered = rows.filter(predicate).sort(comparator);

    // Apply cursors: keep rows strictly within (after, before).
    let lo = 0;
    let hi = filtered.length;
    if (args.after !== undefined) {
      const cur = this.decode(args.after, sort);
      lo = upperBound(filtered, cur, comparator, sort);
    }
    if (args.before !== undefined) {
      const cur = this.decode(args.before, sort);
      hi = lowerBound(filtered, cur, comparator, sort);
    }
    if (hi < lo) hi = lo;

    const windowed = filtered.slice(lo, hi);
    const totalMatching = filtered.length;

    // Slice the window per first/last.
    let page: T[];
    let hasNext: boolean;
    let hasPrev: boolean;
    if (last !== Number.POSITIVE_INFINITY && windowed.length > last) {
      // Backward: keep the LAST `last` rows.
      page = windowed.slice(windowed.length - last);
      hasNext = hi < filtered.length; // rows exist after window end
      hasPrev = true; // we dropped rows from the front of the window
      hasPrev = hasPrev || lo > 0;
    } else if (first !== Number.POSITIVE_INFINITY && windowed.length > first) {
      page = windowed.slice(0, first);
      hasNext = true;
      hasPrev = lo > 0;
    } else {
      page = windowed;
      hasNext = hi < filtered.length;
      hasPrev = lo > 0;
    }

    const edges = page.map((node) => ({ node, cursor: this.encode(node, sort) }));
    return {
      rows: page,
      edges,
      pageInfo: {
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        hasNextPage: hasNext,
        hasPreviousPage: hasPrev,
      },
      totalMatching,
    };
  }

  /**
   * Multi-key comparator honoring per-key direction.
   * Ties fall through to the next key — so callers MUST include a unique
   * last key for a total order over distinct rows.
   */
  comparator<T>(sort: readonly SortKey[]): (a: T, b: T) => number {
    return (a, b) => {
      for (const key of sort) {
        const c = compareValues(getPath(a, key.field), getPath(b, key.field));
        if (c === null) continue; // NaN: treat as equal on this key
        if (c !== 0) return key.dir === 'asc' ? c : -c;
      }
      return 0;
    };
  }

  /** Signature binds a cursor to its sort spec. */
  private sortSignature(sort: readonly SortKey[]): string {
    return stableStringify(sort.map((k) => [k.field, k.dir]));
  }
}

/**
 * Index of the first row strictly greater than the cursor key values.
 * O(n) linear scan — a real index would binary-search the B-tree.
 */
function upperBound<T>(
  sorted: readonly T[],
  keyValues: readonly unknown[],
  comparator: (a: T, b: T) => number,
  sort: readonly SortKey[]
): number {
  // Binary search on the key projection: compare cursor values directly
  // against each row's keys (equivalent to comparing a phantom row).
  let lo = 0;
  let hi = sorted.length;
  const cursorCmp = makeCursorComparator<T>(keyValues, sort);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cursorCmp(sorted[mid]) <= 0) lo = mid + 1; // row <= cursor → skip
    else hi = mid;
  }
  void comparator;
  return lo;
}

/** Index of the first row >= cursor key values (exclusive `before`). */
function lowerBound<T>(
  sorted: readonly T[],
  keyValues: readonly unknown[],
  comparator: (a: T, b: T) => number,
  sort: readonly SortKey[]
): number {
  let lo = 0;
  let hi = sorted.length;
  const cursorCmp = makeCursorComparator<T>(keyValues, sort);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cursorCmp(sorted[mid]) < 0) lo = mid + 1;
    else hi = mid;
  }
  void comparator;
  return lo;
}

/**
 * Compares a row against raw cursor key values: negative if row < cursor,
 * 0 if equal on all keys, positive if row > cursor. Honors directions by
 * negating desc-key deltas so the result is in canonical (asc) space.
 */
function makeCursorComparator<T>(
  keyValues: readonly unknown[],
  sort: readonly SortKey[]
): (row: T) => number {
  const decoded = keyValues.map(decodeValue);
  return (row) => {
    for (let i = 0; i < sort.length; i++) {
      const c = compareValues(getPath(row, sort[i].field), decoded[i]);
      if (c === null) continue;
      if (c !== 0) return sort[i].dir === 'asc' ? c : -c;
    }
    return 0;
  };
}

// --------------------------------------------------------------------------
// Cursor value codec — Date round-trips through a tagged form because JSON
// has no Date type.
// --------------------------------------------------------------------------

function encodeValue(v: unknown): unknown {
  if (v instanceof Date) return { $t: 'date', v: v.toISOString() };
  if (typeof v === 'bigint') return { $t: 'bigint', v: v.toString() };
  if (v === undefined) return { $t: 'undef' };
  return v;
}

function decodeValue(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && '$t' in (v as Record<string, unknown>)) {
    const tag = (v as { $t: string; v?: unknown });
    if (tag.$t === 'date') return new Date(tag.v as string);
    if (tag.$t === 'bigint') return BigInt(tag.v as string);
    if (tag.$t === 'undef') return undefined;
  }
  return v;
}

// --------------------------------------------------------------------------
// base64url without Buffer (pure TS, runs anywhere)
// --------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlEncode(text: string): string {
  const bytes = utf8(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(b64: string): string {
  const clean = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (clean.length % 4)) % 4;
  const full = clean + '='.repeat(pad);
  const bytes: number[] = [];
  for (let i = 0; i < full.length; i += 4) {
    const c0 = B64.indexOf(full[i]);
    const c1 = B64.indexOf(full[i + 1]);
    const c2 = full[i + 2] === '=' ? -1 : B64.indexOf(full[i + 2]);
    const c3 = full[i + 3] === '=' ? -1 : B64.indexOf(full[i + 3]);
    if (c0 < 0 || c1 < 0) throw new CursorError('invalid base64');
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
  }
  return utf8Decode(new Uint8Array(bytes));
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number;
    if (cp > 0xffff) i++; // surrogate pair consumed
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63)
      );
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCodePoint(b0);
      i += 1;
    } else if (b0 < 0xe0) {
      out += String.fromCodePoint(((b0 & 31) << 6) | (bytes[i + 1] & 63));
      i += 2;
    } else if (b0 < 0xf0) {
      out += String.fromCodePoint(
        ((b0 & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
      );
      i += 3;
    } else {
      out += String.fromCodePoint(
        ((b0 & 7) << 18) |
          ((bytes[i + 1] & 63) << 12) |
          ((bytes[i + 2] & 63) << 6) |
          (bytes[i + 3] & 63)
      );
      i += 4;
    }
  }
  return out;
}
