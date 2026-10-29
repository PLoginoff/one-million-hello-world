/**
 * Analyzer
 *
 * Composable analysis pipeline: a char-filter stage (raw text -> text),
 * a tokenizer stage (text -> token stream), and token-filter stages
 * (token stream -> token stream). Mirrors Lucene's Analyzer design.
 */

export interface AnalyzedToken {
  readonly term: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly position: number;
  readonly positionIncrement: number;
  readonly type: 'word' | 'number' | 'shingle' | 'synonym';
}

export type CharFilter = (input: string) => string;
export type TokenizerFn = (input: string) => AnalyzedToken[];
export type TokenFilter = (tokens: readonly AnalyzedToken[]) => AnalyzedToken[];

/** Standard tokenizer: splits on non-letter/digit boundaries. */
export function standardTokenizer(input: string): AnalyzedToken[] {
  const tokens: AnalyzedToken[] = [];
  const pattern = /[\p{L}\p{N}_']+/gu;
  let m: RegExpExecArray | null;
  let position = 0;
  while ((m = pattern.exec(input)) !== null) {
    tokens.push({
      term: m[0],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
      position,
      positionIncrement: 1,
      type: DIGIT_ONLY.test(m[0]) ? 'number' : 'word',
    });
    position++;
  }
  return tokens;
}

const DIGIT_ONLY = /^\d+$/;

/** Whitespace tokenizer: splits on runs of whitespace only. */
export function whitespaceTokenizer(input: string): AnalyzedToken[] {
  const tokens: AnalyzedToken[] = [];
  const pattern = /\S+/g;
  let m: RegExpExecArray | null;
  let position = 0;
  while ((m = pattern.exec(input)) !== null) {
    tokens.push({
      term: m[0],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
      position,
      positionIncrement: 1,
      type: 'word',
    });
    position++;
  }
  return tokens;
}

/** Edge n-gram tokenizer for prefix/autocomplete indexing. */
export function edgeNgramTokenizer(minGram: number, maxGram: number): TokenizerFn {
  return (input: string) => {
    const base = standardTokenizer(input);
    const out: AnalyzedToken[] = [];
    for (const t of base) {
      for (let n = minGram; n <= Math.min(maxGram, t.term.length); n++) {
        out.push({
          term: t.term.slice(0, n),
          startOffset: t.startOffset,
          endOffset: t.startOffset + n,
          position: t.position,
          positionIncrement: 0,
          type: 'word',
        });
      }
    }
    return out;
  };
}

// ---- char filters ----

export const htmlStripCharFilter: CharFilter = (input) =>
  input.replace(/<[^>]+>/g, ' ');

export function mappingCharFilter(mappings: ReadonlyMap<string, string>): CharFilter {
  const keys = [...mappings.keys()].sort((a, b) => b.length - a.length);
  return (input) => {
    let out = input;
    for (const k of keys) {
      out = out.split(k).join(mappings.get(k) ?? '');
    }
    return out;
  };
}

export const patternReplaceCharFilter = (
  pattern: RegExp,
  replacement: string
): CharFilter => {
  return (input) => input.replace(pattern, replacement);
};

// ---- token filters ----

export const lowercaseFilter: TokenFilter = (tokens) =>
  tokens.map((t) => ({ ...t, term: t.term.toLowerCase() }));

export function lengthFilter(min: number, max: number): TokenFilter {
  return (tokens) =>
    tokens.filter((t) => t.term.length >= min && t.term.length <= max);
}

export function stopFilter(stopWords: ReadonlySet<string>): TokenFilter {
  return (tokens) => {
    const out: AnalyzedToken[] = [];
    let removed = 0;
    for (const t of tokens) {
      if (stopWords.has(t.term)) {
        removed++;
        continue;
      }
      out.push({ ...t, positionIncrement: t.positionIncrement + removed });
      removed = 0;
    }
    return out;
  };
}

export function synonymFilter(synonyms: ReadonlyMap<string, readonly string[]>): TokenFilter {
  return (tokens) => {
    const out: AnalyzedToken[] = [];
    for (const t of tokens) {
      out.push(t);
      const syns = synonyms.get(t.term);
      if (syns !== undefined) {
        for (const s of syns) {
          out.push({
            term: s,
            startOffset: t.startOffset,
            endOffset: t.endOffset,
            position: t.position,
            positionIncrement: 0,
            type: 'synonym',
          });
        }
      }
    }
    return out;
  };
}

export function asciiFoldFilter(tokens: readonly AnalyzedToken[]): AnalyzedToken[] {
  return tokens.map((t) => ({
    ...t,
    term: t.term.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  }));
}

export function shingleFilter(size: number, separator = '_'): TokenFilter {
  return (tokens) => {
    const out: AnalyzedToken[] = [...tokens];
    for (let i = 0; i + size <= tokens.length; i++) {
      const window = tokens.slice(i, i + size);
      out.push({
        term: window.map((t) => t.term).join(separator),
        startOffset: window[0].startOffset,
        endOffset: window[window.length - 1].endOffset,
        position: window[0].position,
        positionIncrement: 0,
        type: 'shingle',
      });
    }
    return out;
  };
}

/**
 * Simplified Porter stemmer as a token filter. Implements the core
 * step-1 rules (plurals, -ed, -ing) — enough for search normalization.
 */
export function porterStemFilter(tokens: readonly AnalyzedToken[]): AnalyzedToken[] {
  return tokens.map((t) => ({ ...t, term: porterStem(t.term) }));
}

function hasVowel(w: string): boolean {
  return /[aeiou]/.test(w) || (w.length > 1 && /[aeiou].*y/.test(w));
}

function measure(w: string): number {
  // Porter measure m: [C](VC)^m[V]
  let m = 0;
  let i = 0;
  const isConsonant = (c: string, idx: number): boolean => {
    if (/[aeiou]/.test(c)) return false;
    if (c === 'y') return idx === 0 ? true : !isConsonant(w[idx - 1], idx - 1);
    return true;
  };
  while (i < w.length && isConsonant(w[i], i)) i++;
  for (;;) {
    while (i < w.length && !isConsonant(w[i], i)) i++;
    if (i >= w.length) return m;
    while (i < w.length && isConsonant(w[i], i)) i++;
    m++;
  }
}

function endsDoubleConsonant(w: string): boolean {
  if (w.length < 2) return false;
  const a = w[w.length - 1];
  const b = w[w.length - 2];
  return a === b && !/[aeiou]/.test(a);
}

function endsCvc(w: string): boolean {
  if (w.length < 3) return false;
  const c1 = w[w.length - 3];
  const c2 = w[w.length - 2];
  const c3 = w[w.length - 1];
  const cons = (c: string) => !/[aeiou]/.test(c);
  return cons(c1) && !cons(c2) && cons(c3) && !/[wxy]/.test(c3);
}

/** Porter step 1a/1b: plurals and past-tense/gerund suffixes. */
export function porterStem(word: string): string {
  if (word.length <= 2) return word;
  let w = word;
  // step 1a
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (w.endsWith('ss')) { /* keep */ }
  else if (w.endsWith('s')) w = w.slice(0, -1);
  // step 1b
  if (w.endsWith('eed')) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
    return w;
  }
  let flag = false;
  if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    flag = true;
  } else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    flag = true;
  }
  if (flag) {
    if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) {
      w += 'e';
    } else if (endsDoubleConsonant(w) && !/[lsz]/.test(w[w.length - 1])) {
      w = w.slice(0, -1);
    } else if (measure(w) === 1 && endsCvc(w)) {
      w += 'e';
    }
  }
  // step 1c
  if (w.endsWith('y') && hasVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + 'i';
  }
  return w;
}

/** An analyzer composes char filters, one tokenizer, and token filters. */
export class Analyzer {
  private readonly charFilters: readonly CharFilter[];
  private readonly tokenizer: TokenizerFn;
  private readonly tokenFilters: readonly TokenFilter[];

  constructor(options: {
    charFilters?: readonly CharFilter[];
    tokenizer?: TokenizerFn;
    tokenFilters?: readonly TokenFilter[];
  } = {}) {
    this.charFilters = options.charFilters ?? [];
    this.tokenizer = options.tokenizer ?? standardTokenizer;
    this.tokenFilters = options.tokenFilters ?? [lowercaseFilter];
  }

  analyze(text: string): AnalyzedToken[] {
    let input = text;
    for (const f of this.charFilters) input = f(input);
    let tokens = this.tokenizer(input);
    for (const f of this.tokenFilters) tokens = f(tokens);
    return tokens;
  }

  terms(text: string): string[] {
    return this.analyze(text).map((t) => t.term);
  }
}

/** Preset: English-like analyzer (lowercase, ascii fold, stop, stem). */
export function englishAnalyzer(stopWords?: ReadonlySet<string>): Analyzer {
  const stops = stopWords ?? new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if',
    'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'with',
  ]);
  return new Analyzer({
    tokenFilters: [
      lowercaseFilter,
      asciiFoldFilter,
      stopFilter(stops),
      porterStemFilter,
    ],
  });
}
