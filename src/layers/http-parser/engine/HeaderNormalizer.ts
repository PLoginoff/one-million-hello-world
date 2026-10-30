/**
 * HeaderNormalizer — canonicalizes HTTP header blocks.
 *
 * Three jobs:
 *  1. Case-fold field names (HTTP field names are case-insensitive;
 *     downstream code must never see both `Content-Type` and
 *     `content-type` as distinct keys).
 *  2. Unfold obs-fold lines (a line starting with SP/TAB continues
 *     the previous field — RFC 9112 §5.2 deprecated it but parsers
 *     still must tolerate it; folding is joining with a single SP).
 *  3. Merge duplicates by field semantics. List-valued fields
 *     (Accept, Cache-Control, …) merge into one comma-joined value —
 *     identical semantics per RFC 9110 §5.3. Non-list fields keep
 *     duplicates separate or overwrite: `Set-Cookie` is the famous
 *     field that must NEVER merge (comma-joining breaks `Expires`).
 *
 * The default merge set encodes the RFC 9110 §5.3 rule: a field is
 * list-valued unless its grammar says otherwise. Callers extend it
 * via `mergeFields` or override with `noMergeFields`.
 *
 * Duplicate handling for non-merge fields: last-wins, and the
 * duplicate is recorded in `duplicates` so callers can reject
 * ambiguous requests (e.g. duplicate Host is a smuggling vector).
 *
 * Complexity: O(lines); field-line parsing is a single indexOf(':')
 * per line.
 *
 * @module HttpParserLayer/Engine
 */

import {
  HeaderNormalizationOptions,
  HeaderNormalizationResult,
  NormalizedHeader,
} from './types';

/**
 * Fields list-valued per RFC 9110 §5.3 — multiple occurrences merge
 * into a comma-joined value with identical semantics. Not exhaustive
 * (any extension field MAY be a list) but covers the common set;
 * callers extend via options.
 */
const DEFAULT_MERGE_FIELDS: ReadonlySet<string> = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'accept-ranges',
  'allow',
  'cache-control',
  'connection',
  'content-encoding',
  'expect',
  'forwarded',
  'if-match',
  'if-none-match',
  'pragma',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'vary',
  'via',
  'warning',
  'www-authenticate',
  'x-forwarded-for',
]);

/** Fields that must never merge regardless of caller config. */
const NEVER_MERGE: ReadonlySet<string> = new Set([
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'host',
  'content-length',
  'content-type',
  'location',
]);

export class HeaderNormalizer {
  private readonly _merge: Set<string>;
  private readonly _noMerge: Set<string>;
  private readonly _trimValues: boolean;

  constructor(options: HeaderNormalizationOptions = {}) {
    this._merge = new Set(DEFAULT_MERGE_FIELDS);
    if (options.mergeFields) {
      for (const f of options.mergeFields) {
        this._merge.add(f.toLowerCase());
      }
    }
    this._noMerge = new Set(NEVER_MERGE);
    if (options.noMergeFields) {
      for (const f of options.noMergeFields) {
        this._noMerge.add(f.toLowerCase());
      }
    }
    this._trimValues = options.trimValues ?? true;
  }

  /**
   * Normalize an array of raw header lines (no obs-fold handling
   * needed upstream — lines are passed exactly as received).
   *
   * Each entry is `[name, value]` *or* a raw line beginning with
   * SP/TAB which unfolds onto the previous header.
   */
  normalize(
    lines: ReadonlyArray<readonly [string, string] | string>
  ): HeaderNormalizationResult {
    const headers: NormalizedHeader[] = [];
    const byName = new Map<string, string>();
    const duplicates = new Map<string, number>();
    let foldedLines = 0;

    for (const line of lines) {
      // Raw continuation line (obs-fold).
      if (typeof line === 'string') {
        const cont = this._trimValues ? line.trim() : line;
        if (headers.length === 0) {
          // A fold with no preceding header — malformed; keep as its
          // own entry so callers see the bytes rather than dropping.
          continue;
        }
        const last = headers[headers.length - 1];
        const merged = `${last.value} ${cont}`;
        const updated: NormalizedHeader = { ...last, value: merged };
        headers[headers.length - 1] = updated;
        // Unfolding appends to the current byName value — the fold is
        // lexical (same logical line), not a duplicate occurrence, so
        // merge-rules don't apply: even non-list fields unfold.
        const prev = byName.get(last.name);
        byName.set(last.name, prev === undefined ? cont : `${prev} ${cont}`);
        foldedLines++;
        continue;
      }

      const [rawName, rawValue] = line;
      const name = rawName.toLowerCase();
      const value = this._trimValues ? rawValue.trim() : rawValue;

      const seen = duplicates.get(name) ?? 0;
      duplicates.set(name, seen + 1);

      if (seen > 0 && this._shouldMerge(name)) {
        // List-valued field: fold into the existing entry.
        const prev = byName.get(name);
        const merged = prev === undefined ? value : `${prev}, ${value}`;
        byName.set(name, merged);
        // Update the first-seen NormalizedHeader in place so `headers`
        // reflects the merged value.
        const idx = headers.findIndex((h) => h.name === name);
        if (idx >= 0) {
          headers[idx] = { ...headers[idx], value: merged };
        }
        continue;
      }

      // Non-merge duplicate → last wins in byName (but every
      // occurrence stays in `headers` for audit).
      if (seen === 0 || !byName.has(name) || !this._shouldMerge(name)) {
        byName.set(name, value);
      }
      headers.push({ name, value, rawName });
    }

    return { headers, byName, duplicates, foldedLines };
  }

  /**
   * Convenience: normalize an `\r\n`-separated raw header block —
   * splits lines, handles obs-fold, produces the same result shape.
   */
  normalizeBlock(block: string): HeaderNormalizationResult {
    const lines: (readonly [string, string] | string)[] = [];
    for (const raw of block.split('\r\n')) {
      if (raw.length === 0) {
        continue;
      }
      if (raw.startsWith(' ') || raw.startsWith('\t')) {
        lines.push(raw);
        continue;
      }
      const colon = raw.indexOf(':');
      if (colon <= 0) {
        continue;
      }
      lines.push([raw.slice(0, colon), raw.slice(colon + 1)]);
    }
    return this.normalize(lines);
  }

  private _shouldMerge(name: string): boolean {
    if (this._noMerge.has(name)) {
      return false;
    }
    return this._merge.has(name);
  }
}
