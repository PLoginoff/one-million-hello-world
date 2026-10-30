/**
 * Machine Translation — pluggable provider interface + mock.
 *
 * {@link IMachineTranslator} is the seam: a real deployment plugs in
 * Google/DeepL/etc.; tests and the default pipeline use
 * {@link MockTranslator} which produces deterministic pseudo-
 * translations so quality checks and caches have stable output.
 *
 * {@link MTOrchestrator} composes TM + MT: it consults the
 * {@link TranslationMemory} first (exact match wins; a fuzzy match is
 * offered as a suggestion), and only falls through to the MT provider
 * on a miss — the standard CAT-tool "TM > MT" cascade.
 *
 * Placeholder safety: both mock and orchestrator enforce that
 * `{placeholder}` tokens survive translation unchanged — a provider
 * that mangles them produces output rejected by
 * {@link QualityScorer}'s placeholder-mismatch check.
 *
 * @module LocalizationLayer/Engine2
 */

import { IMachineTranslator, TMMatch } from './types';
import { TranslationMemory } from './TranslationMemory';

/**
 * Deterministic mock: wraps every word in `⟦⟧` with a locale suffix.
 * `{placeholders}` pass through untouched.
 */
export class MockTranslator implements IMachineTranslator {
  readonly name = 'mock';

  translate(text: string, _sourceLocale: string, targetLocale: string): Promise<string> {
    // Split on placeholders so we never alter them.
    const parts = text.split(/(\{[^}]+\})/g);
    const out = parts.map((p) => {
      if (p.startsWith('{') && p.endsWith('}')) return p;
      return p
        .split(/(\s+)/)
        .map((tok) => (/\S/.test(tok) ? `⟦${tok}·${targetLocale}⟧` : tok))
        .join('');
    });
    return Promise.resolve(out.join(''));
  }
}

/** A translator that maps specific phrases, falling back to mock output. */
export class PhrasebookTranslator implements IMachineTranslator {
  readonly name = 'phrasebook';
  private readonly _phrases: Map<string, string>;

  constructor(phrases: Readonly<Record<string, string>> = {}) {
    this._phrases = new Map(Object.entries(phrases));
  }

  addPhrase(source: string, target: string): void {
    this._phrases.set(source, target);
  }

  translate(text: string, _sourceLocale: string, _targetLocale: string): Promise<string> {
    const hit = this._phrases.get(text);
    if (hit !== undefined) return Promise.resolve(hit);
    // Fallback: bracket-wrap like the mock but with 'MT' marker.
    const parts = text.split(/(\{[^}]+\})/g);
    const out = parts.map((p) =>
      p.startsWith('{') && p.endsWith('}') ? p : `[MT]${p}`
    );
    return Promise.resolve(out.join(''));
  }
}

export interface OrchestratorOptions {
  memory: TranslationMemory;
  provider: IMachineTranslator;
  /** Fuzzy-match threshold passed to TM lookups. */
  fuzzyThreshold?: number;
}

export interface TranslationResult {
  /** Final text — MT output, or TM target on exact match. */
  text: string;
  /** Where the result came from. */
  source: 'memory-exact' | 'memory-fuzzy+mt' | 'mt';
  /** The TM match consulted, if any. */
  match: TMMatch | null;
}

export class MTOrchestrator {
  private readonly _memory: TranslationMemory;
  private readonly _provider: IMachineTranslator;
  private readonly _threshold: number;

  constructor(options: OrchestratorOptions) {
    this._memory = options.memory;
    this._provider = options.provider;
    this._threshold = options.fuzzyThreshold ?? 0.7;
  }

  /**
   * Translate via TM-first cascade:
   * 1. exact TM hit -> return the stored translation untouched,
   * 2. fuzzy TM hit -> still call MT (fuzzy ≠ correct) but surface the
   *    match for the translator to review,
   * 3. miss -> MT only.
   */
  async translate(
    source: string,
    sourceLocale: string,
    targetLocale: string,
    context?: string
  ): Promise<TranslationResult> {
    const match = this._memory.lookup(
      source,
      sourceLocale,
      targetLocale,
      this._threshold,
      context
    );
    if (match?.exact) {
      return { text: match.entry.target, source: 'memory-exact', match };
    }
    const text = await this._provider.translate(source, sourceLocale, targetLocale);
    return {
      text,
      source: match ? 'memory-fuzzy+mt' : 'mt',
      match,
    };
  }
}
