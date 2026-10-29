/**
 * Tokenizer
 *
 * Splits raw text into normalized tokens suitable for indexing and querying.
 * Supports lowercasing, punctuation stripping, stop-word removal,
 * minimum length filtering, and Porter-style suffix stemming.
 */

export interface TokenizerOptions {
  readonly lowercase: boolean;
  readonly minLength: number;
  readonly removeStopWords: boolean;
  readonly stem: boolean;
  readonly stopWords?: ReadonlySet<string>;
}

export const DEFAULT_STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'to', 'was', 'will', 'with',
  'this', 'from', 'has', 'have', 'had', 'were', 'been', 'would', 'could',
  'should', 'do', 'does', 'did', 'so', 'up', 'out', 'about', 'which', 'when',
]);

export interface Token {
  readonly term: string;
  readonly original: string;
  readonly position: number;
}

const DEFAULT_OPTIONS: TokenizerOptions = {
  lowercase: true,
  minLength: 1,
  removeStopWords: false,
  stem: false,
};

/**
 * A very small suffix-stripping stemmer covering the most common English
 * inflections. Not a full Porter implementation, but deterministic and safe.
 */
export function simpleStem(word: string): string {
  if (word.length <= 3) return word;
  let w = word;
  // plural rules
  if (w.endsWith('ies') && w.length > 4) {
    w = w.slice(0, -3) + 'y';
  } else if (w.endsWith('es') && w.length > 4 && /[^aeiou]es$/.test(w)) {
    w = w.slice(0, -2);
  } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    w = w.slice(0, -1);
  }
  // common suffixes
  if (w.endsWith('ing') && w.length > 5) {
    w = w.slice(0, -3);
    if (w.length > 1 && w[w.length - 1] === w[w.length - 2]) {
      w = w.slice(0, -1); // running -> run
    }
  } else if (w.endsWith('ed') && w.length > 4) {
    w = w.slice(0, -2);
    if (w.length > 1 && w[w.length - 1] === w[w.length - 2]) {
      w = w.slice(0, -1);
    }
  } else if (w.endsWith('ly') && w.length > 4) {
    w = w.slice(0, -2);
  }
  return w;
}

export class Tokenizer {
  private readonly options: TokenizerOptions;

  constructor(options: Partial<TokenizerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  tokenize(text: string): Token[] {
    const raw = text.split(/[^\p{L}\p{N}'_]+/u).filter((s) => s.length > 0);
    const tokens: Token[] = [];
    let position = 0;
    for (const original of raw) {
      let term = this.options.lowercase ? original.toLowerCase() : original;
      term = term.replace(/^'+|'+$/g, '');
      if (term.length < this.options.minLength) {
        position++;
        continue;
      }
      if (this.options.stem) {
        term = simpleStem(term);
      }
      if (
        this.options.removeStopWords &&
        this.options.stopWords !== undefined &&
        this.options.stopWords.has(term)
      ) {
        position++;
        continue;
      }
      if (
        this.options.removeStopWords &&
        this.options.stopWords === undefined &&
        DEFAULT_STOP_WORDS.has(term)
      ) {
        position++;
        continue;
      }
      tokens.push({ term, original, position });
      position++;
    }
    return tokens;
  }

  terms(text: string): string[] {
    return this.tokenize(text).map((t) => t.term);
  }
}
