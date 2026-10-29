/**
 * Highlighter
 *
 * Extracts snippets from document text around matched terms and wraps
 * them in highlight markers. Snippet windows are chosen to maximize
 * term coverage density.
 */

import { Tokenizer } from '../index/Tokenizer';

export interface HighlightOptions {
  readonly preTag: string;
  readonly postTag: string;
  /** target snippet length in characters */
  readonly fragmentSize: number;
  /** max number of fragments per field */
  readonly maxFragments: number;
  readonly fragmentSeparator: string;
}

export const DEFAULT_HIGHLIGHT: HighlightOptions = {
  preTag: '<em>',
  postTag: '</em>',
  fragmentSize: 160,
  maxFragments: 3,
  fragmentSeparator: ' … ',
};

export interface HighlightedField {
  readonly field: string;
  readonly fragments: readonly string[];
}

interface TermOccurrence {
  readonly start: number;
  readonly end: number;
  readonly term: string;
}

/** Find all character offsets where any of `terms` occurs in `text`. */
export function findOccurrences(
  text: string,
  terms: readonly string[],
  tokenizer: Tokenizer
): TermOccurrence[] {
  const termSet = new Set(terms);
  const occurrences: TermOccurrence[] = [];
  // map token positions to character offsets via regex scanning
  const pattern = /[^\p{L}\p{N}'_]+|([\p{L}\p{N}'_]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[1] === undefined) continue;
    const original = m[1];
    const normalized = tokenizer.terms(original);
    for (const t of normalized) {
      if (termSet.has(t)) {
        occurrences.push({
          start: m.index,
          end: m.index + original.length,
          term: t,
        });
        break;
      }
    }
  }
  return occurrences;
}

/** Choose the best fragment window [start,end) covering the most hits. */
export function bestWindow(
  occurrences: readonly TermOccurrence[],
  textLength: number,
  fragmentSize: number
): { start: number; end: number; hits: number } | null {
  if (occurrences.length === 0) return null;
  let best: { start: number; end: number; hits: number } | null = null;
  for (const occ of occurrences) {
    // window centered on the occurrence
    let start = occ.start - Math.floor(fragmentSize / 2);
    start = Math.max(0, start);
    let end = Math.min(textLength, start + fragmentSize);
    start = Math.max(0, end - fragmentSize);
    let hits = 0;
    for (const o of occurrences) {
      if (o.start >= start && o.end <= end) hits++;
    }
    if (best === null || hits > best.hits) {
      best = { start, end, hits };
    }
  }
  return best;
}

function applyTags(fragment: string, baseOffset: number, occurrences: readonly TermOccurrence[], pre: string, post: string): string {
  // collect occurrences inside the fragment, sort by start desc for safe splice
  const inside = occurrences
    .filter((o) => o.start >= baseOffset && o.end <= baseOffset + fragment.length)
    .sort((a, b) => b.start - a.start);
  let out = fragment;
  for (const o of inside) {
    const s = o.start - baseOffset;
    const e = o.end - baseOffset;
    out = out.slice(0, s) + pre + out.slice(s, e) + post + out.slice(e);
  }
  return out;
}

export class Highlighter {
  private readonly tokenizer: Tokenizer;
  private readonly options: HighlightOptions;

  constructor(tokenizer?: Tokenizer, options: Partial<HighlightOptions> = {}) {
    this.tokenizer = tokenizer ?? new Tokenizer();
    this.options = { ...DEFAULT_HIGHLIGHT, ...options };
  }

  /** Highlight a single text field, returning fragments. */
  highlight(text: string, terms: readonly string[]): string[] {
    if (terms.length === 0 || text.length === 0) return [];
    const occurrences = findOccurrences(text, terms, this.tokenizer);
    if (occurrences.length === 0) return [];
    const fragments: string[] = [];
    const usedRanges: Array<{ start: number; end: number }> = [];
    let remaining = [...occurrences];
    while (fragments.length < this.options.maxFragments && remaining.length > 0) {
      const win = bestWindow(remaining, text.length, this.options.fragmentSize);
      if (win === null) break;
      const fragment = text.slice(win.start, win.end);
      const tagged = applyTags(
        fragment,
        win.start,
        occurrences,
        this.options.preTag,
        this.options.postTag
      );
      const prefix = win.start > 0 ? '…' : '';
      const suffix = win.end < text.length ? '…' : '';
      fragments.push(prefix + tagged + suffix);
      usedRanges.push({ start: win.start, end: win.end });
      remaining = remaining.filter(
        (o) => !(o.start >= win.start && o.end <= win.end)
      );
    }
    return fragments;
  }

  /** Highlight across all fields of a document. */
  highlightDocument(
    fields: Readonly<Record<string, string>>,
    terms: readonly string[]
  ): HighlightedField[] {
    const out: HighlightedField[] = [];
    for (const [field, text] of Object.entries(fields)) {
      const fragments = this.highlight(text, terms);
      if (fragments.length > 0) {
        out.push({ field, fragments });
      }
    }
    return out;
  }
}
