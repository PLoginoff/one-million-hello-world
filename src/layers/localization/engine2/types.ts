/**
 * Localization Engine2 — shared types.
 *
 * Type definitions for the translation-pipeline module: translation
 * memory with fuzzy matching, pluggable machine-translation providers,
 * locale fallback chains, CLDR plural-rule edge cases, and translation
 * quality scoring.
 *
 * @module LocalizationLayer/Engine2
 */

/** A single catalog entry: message key -> localized string. */
export type MessageMap = Readonly<Record<string, string>>;

/** Catalog for one locale: locale tag -> key -> message. */
export interface LocaleCatalog {
  locale: string;
  messages: MessageMap;
}

// ---------------------------------------------------------------------------
// Translation memory
// ---------------------------------------------------------------------------

/** One stored translation pair. */
export interface TMEntry {
  /** Source-language text. */
  source: string;
  /** Translated text. */
  target: string;
  /** Source locale tag, e.g. "en". */
  sourceLocale: string;
  /** Target locale tag, e.g. "fr". */
  targetLocale: string;
  /** Context/domain key, e.g. "checkout". Optional scoping. */
  context?: string;
}

/** A fuzzy lookup result. */
export interface TMMatch {
  entry: TMEntry;
  /** Similarity score in (0, 1]; 1 = exact. */
  score: number;
  /** True only when score is exactly 1 (exact source match). */
  exact: boolean;
}

// ---------------------------------------------------------------------------
// Machine translation
// ---------------------------------------------------------------------------

/** Pluggable MT provider — implement to bridge a real backend. */
export interface IMachineTranslator {
  /** Provider name, e.g. "mock", "google", "deepl". */
  readonly name: string;
  /**
   * Translate `text` from `sourceLocale` to `targetLocale`.
   * Must preserve `{placeholder}` tokens verbatim.
   */
  translate(text: string, sourceLocale: string, targetLocale: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Fallback chains
// ---------------------------------------------------------------------------

/**
 * Resolution order for one requested locale, e.g. requesting
 * `fr-CA` produces `['fr-CA', 'fr', 'en']` when `en` is the default.
 * Per-key overrides can pin a key to a different chain.
 */
export interface FallbackChain {
  requested: string;
  /** Ordered locales to try, most-specific first. */
  chain: string[];
}

/** A key pinned to a locale that bypasses the standard chain. */
export interface KeyOverride {
  key: string;
  locale: string;
}

// ---------------------------------------------------------------------------
// Plurals
// ---------------------------------------------------------------------------

/**
 * CLDR plural categories. Not every language uses all of them —
 * e.g. English uses only one/other, Russian uses one/few/many/other,
 * Arabic uses all six.
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Plural forms for one message, keyed by CLDR category. */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

/** One detected quality problem in a locale catalog. */
export interface QualityIssue {
  key: string;
  locale: string;
  kind: 'missing' | 'placeholder-mismatch' | 'empty' | 'untranslated';
  /** Human-readable detail. */
  detail: string;
}

/** Quality report for one locale vs. a reference catalog. */
export interface QualityReport {
  locale: string;
  referenceLocale: string;
  /** Score in [0, 1] — 1 = perfect coverage + placeholders. */
  score: number;
  issues: QualityIssue[];
}
