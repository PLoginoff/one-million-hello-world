/**
 * QueryUnderstanding — intent detection for raw query text.
 *
 * The layer's `QueryAst` parses a *structured* query language once
 * the caller already knows the query is structured. This classifier
 * sits one step earlier: given arbitrary user keystrokes it decides
 * WHICH execution path should handle the query:
 *
 *   "new york times"      → phrase    (quoted, positional match)
 *   title:dune            → fielded   (structured clause)
 *   tokenization~         → fuzzy     (tilde / wildcard marker)
 *   refrig                → exact     (single term — autocomplete
 *                                      takes over upstream; the index
 *                                      needs an exact-term lookup)
 *   best laptops 2024     → ranked    (free-text multi-term)
 *
 * Detection rules, in precedence order:
 * 1. Balanced double-quoted span covering the whole query → phrase.
 * 2. ≥1 `field:value` clause (known fields + `x:` syntax) → fielded.
 * 3. `~`, `~N`, `*`, `?` markers → fuzzy.
 * 4. Single term → exact.
 * 5. Otherwise → ranked.
 *
 * It also detects the dominant script (CJK vs latin) because token
 * segmentation strategies differ — CJK needs unigram/bigram
 * splitting, latin needs whitespace+stemming.
 *
 * Confidence: deterministic heuristics — a quoted phrase is 0.95,
 * fielded 0.9, fuzzy 0.85, exact 0.8; ranked free-text is 0.6 since
 * it overlaps with everything.
 *
 * @module SearchLayer/Engine
 */

import { QueryIntent, QueryTerm, UnderstoodQuery } from './types';

export interface QueryUnderstandingOptions {
  /**
   * Field names recognized as structured clauses. When provided,
   * `foo:bar` with an *unknown* field is treated as free text
   * (users type colons in normal prose too).
   * When omitted, ANY `ident:value` counts as a field clause.
   */
  readonly knownFields?: readonly string[];
}

// Hiragana, Katakana, CJK Unified, Hangul syllables.
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const FIELD_CLAUSE = /([A-Za-z_][A-Za-z0-9_.-]*):([^\s"]+|"[^"]*")/g;
const FUZZY_MARKER = /~(\d+)?$/;
const WILDCARD = /[*?]/;

export class QueryUnderstanding {
  private readonly _knownFields: ReadonlySet<string> | null;

  constructor(options: QueryUnderstandingOptions = {}) {
    this._knownFields =
      options.knownFields !== undefined ? new Set(options.knownFields) : null;
  }

  understand(raw: string): UnderstoodQuery {
    const text = raw.trim();
    const script = detectScript(text);

    if (text.length === 0) {
      return { intent: 'ranked', terms: [], raw, script, confidence: 0 };
    }

    // 1. Whole-query phrase.
    const phrase = extractWholePhrase(text);
    if (phrase !== null) {
      return {
        intent: 'phrase',
        terms: tokenize(phrase).map((t) => ({ text: t })),
        phrase,
        raw,
        script,
        confidence: 0.95,
      };
    }

    // 2. Fielded clauses.
    const fielded = extractFieldClauses(text, this._knownFields);
    if (fielded.length > 0) {
      return {
        intent: 'fielded',
        terms: fielded,
        raw,
        script,
        confidence: 0.9,
      };
    }

    // 3. Fuzzy / wildcard markers on any token.
    const tokens = tokenize(text);
    const fuzzyTerms: QueryTerm[] = [];
    let hasFuzzy = false;
    for (const tok of tokens) {
      const fuzzyMatch = tok.match(FUZZY_MARKER);
      const wild = WILDCARD.test(tok);
      if (fuzzyMatch !== null || wild) {
        hasFuzzy = true;
        fuzzyTerms.push({
          text: fuzzyMatch !== null ? tok.slice(0, fuzzyMatch.index) : tok,
          fuzzy:
            fuzzyMatch !== null && fuzzyMatch[1] !== undefined
              ? parseInt(fuzzyMatch[1], 10)
              : fuzzyMatch !== null
                ? 2
                : undefined,
          wildcard: wild || undefined,
        });
      } else {
        fuzzyTerms.push({ text: tok });
      }
    }
    if (hasFuzzy) {
      return { intent: 'fuzzy', terms: fuzzyTerms, raw, script, confidence: 0.85 };
    }

    // 4. Single term.
    if (tokens.length === 1) {
      return {
        intent: 'exact',
        terms: [{ text: tokens[0] }],
        raw,
        script,
        confidence: 0.8,
      };
    }

    // 5. Free text.
    return {
      intent: 'ranked',
      terms: tokens.map((t) => ({ text: t })),
      raw,
      script,
      confidence: 0.6,
    };
  }

  /** Convenience: just the intent label. */
  intentOf(raw: string): QueryIntent {
    return this.understand(raw).intent;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/** Extract a phrase iff the whole query is one balanced quoted span. */
function extractWholePhrase(text: string): string | null {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    const inner = text.slice(1, -1);
    if (!inner.includes('"') && inner.trim().length > 0) return inner;
  }
  return null;
}

/**
 * Find all `field:value` clauses. When `known` is non-null, clauses
 * whose field isn't in the list are skipped (treated as free text).
 */
function extractFieldClauses(
  text: string,
  known: ReadonlySet<string> | null
): QueryTerm[] {
  const out: QueryTerm[] = [];
  for (const m of text.matchAll(FIELD_CLAUSE)) {
    const field = m[1];
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (known !== null && !known.has(field)) continue;
    out.push({ text: value, field });
  }
  return out;
}

/** 'cjk' when any CJK codepoint is present, else 'latin'. */
function detectScript(text: string): 'cjk' | 'latin' {
  return CJK.test(text) ? 'cjk' : 'latin';
}
