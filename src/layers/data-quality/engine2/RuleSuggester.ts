/**
 * Validation Rule Suggester
 *
 * Infers candidate quality rules from observed data — the "suggested
 * constraints" feature real profilers (Deequ's `ConstraintSuggestion`,
 * Great Expectations' `DataAssistant`) build on top of profiles:
 *
 *   - completeness < 1.0       → CompletenessRule at observed ratio
 *   - cardinality ≈ 1          → UniquenessRule (candidate key)
 *   - dominant string pattern  → ValidityRule with that regex
 *   - numeric range            → ValidityRule min/max with margin
 *   - length bounds            → ValidityRule minLength/maxLength
 *   - low cardinality          → ValidityRule allowedValues from top-k
 *   - recency in timestamps    → FreshnessRule if a timestamp column
 *     is present and consistently recent
 *
 * Each suggestion carries the evidence (profile stats + observed
 * fraction) and a confidence — how strongly the data supports the rule.
 * Confidence is the key output: a column where 99.7% of values match an
 * email pattern is a much stronger email-rule candidate than one at
 * 60%, even though both are "email-shaped".
 *
 * Suggestions are returned as *rule descriptors* — factory objects a
 * caller can instantiate against the existing QualityRules classes,
 * keeping this engine decoupled from the runtime.
 *
 * Complexity: O(#columns × topK) after profiling.
 *
 * @module DataQuality/Engine2
 */

import { DeepColumnProfile, StringPattern } from './DataProfiler';
import { QualityDimension } from '../engine/QualityRules';

/** A suggested rule — declarative, not instantiated. */
export interface SuggestedRule {
  /** Suggested rule kind matching QualityRules classes. */
  readonly ruleKind:
    | 'completeness'
    | 'uniqueness'
    | 'validity-regex'
    | 'validity-range'
    | 'validity-length'
    | 'validity-enum'
    | 'freshness';
  readonly column: string;
  readonly dimension: QualityDimension;
  /** Human-readable justification (e.g. "99.2% of values are integers"). */
  readonly evidence: string;
  /** How strongly the data supports the rule, 0–1. */
  readonly confidence: number;
  /** Parameters the caller would pass to the rule constructor. */
  readonly params: Readonly<Record<string, unknown>>;
}

/** Suggester tuning. */
export interface SuggesterConfig {
  /** Minimum confidence to surface a suggestion. Default 0.7. */
  readonly minConfidence: number;
  /** Cardinality ratio above which a column is a uniqueness candidate. Default 0.98. */
  readonly keyCardinalityThreshold: number;
  /** Completeness below which a completeness rule is suggested. Default 0.999. */
  readonly completenessThreshold: number;
  /** String-pattern share required to suggest a regex rule. Default 0.9. */
  readonly patternShareThreshold: number;
  /**
   * Margin added around observed min/max for range rules, as a
   * fraction of the observed range. Default 0.1 (10% headroom).
   */
  readonly rangeMarginRatio: number;
  /** Max enum values suggested for allowedValues. Default 20. */
  readonly maxEnumValues: number;
  /** Max cardinality ratio to consider enum suggestions. Default 0.05. */
  readonly enumCardinalityRatio: number;
  /** Freshness staleness bound (ms) suggested when timestamps look recent. */
  readonly freshnessMs: number;
}

export const DEFAULT_SUGGESTER_CONFIG: SuggesterConfig = {
  minConfidence: 0.7,
  keyCardinalityThreshold: 0.98,
  completenessThreshold: 0.999,
  patternShareThreshold: 0.9,
  rangeMarginRatio: 0.1,
  maxEnumValues: 20,
  enumCardinalityRatio: 0.05,
  freshnessMs: 24 * 60 * 60 * 1000,
};

const PATTERN_REGEX: Readonly<Partial<Record<StringPattern, string>>> = {
  [StringPattern.EMAIL]: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
  [StringPattern.UUID]: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  [StringPattern.ISO_DATE]: '^\\d{4}-\\d{2}-\\d{2}$',
  [StringPattern.ISO_TIMESTAMP]: '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}',
  [StringPattern.INTEGER]: '^-?\\d+$',
  [StringPattern.DECIMAL]: '^-?\\d*\\.\\d+$',
  [StringPattern.URL]: '^https?://',
};

/**
 * RuleSuggester — infer candidate rules from column profiles.
 */
export class RuleSuggester {
  private readonly _config: SuggesterConfig;

  constructor(config: Partial<SuggesterConfig> = {}) {
    this._config = { ...DEFAULT_SUGGESTER_CONFIG, ...config };
  }

  /**
   * Generate suggestions for one column profile.
   */
  suggest(profile: DeepColumnProfile): SuggestedRule[] {
    const cfg = this._config;
    const out: SuggestedRule[] = [];
    if (profile.rowCount === 0) return out;

    // --- completeness --------------------------------------------------
    if (profile.completeness < cfg.completenessThreshold && profile.nonNullCount > 0) {
      const missingRatio = 1 - profile.completeness;
      out.push({
        ruleKind: 'completeness',
        column: profile.column,
        dimension: 'completeness',
        evidence: `${(missingRatio * 100).toFixed(2)}% of rows missing`,
        confidence: Math.min(1, profile.completeness + 0.01),
        params: { minCompleteRatio: profile.completeness },
      });
    }

    // --- uniqueness (candidate key) -------------------------------------
    if (
      profile.cardinalityRatio >= cfg.keyCardinalityThreshold &&
      !profile.cardinalityTruncated &&
      profile.nonNullCount >= 10
    ) {
      out.push({
        ruleKind: 'uniqueness',
        column: profile.column,
        dimension: 'uniqueness',
        evidence: `cardinality ratio ${profile.cardinalityRatio.toFixed(3)} over ${profile.nonNullCount} values`,
        confidence: profile.cardinalityRatio,
        params: { columns: [profile.column] },
      });
    }

    // --- regex from dominant pattern ------------------------------------
    if (profile.dominantPattern !== null) {
      const p = profile.dominantPattern;
      const re = PATTERN_REGEX[p.pattern];
      if (re !== undefined && p.share >= cfg.patternShareThreshold) {
        out.push({
          ruleKind: 'validity-regex',
          column: profile.column,
          dimension: 'validity',
          evidence: `${(p.share * 100).toFixed(1)}% of strings match ${p.pattern}`,
          confidence: p.share,
          params: { pattern: re },
        });
      }
    }

    // --- numeric range --------------------------------------------------
    if (Number.isFinite(profile.min) && Number.isFinite(profile.max) && profile.min < profile.max) {
      const span = profile.max - profile.min;
      const margin = span * cfg.rangeMarginRatio;
      out.push({
        ruleKind: 'validity-range',
        column: profile.column,
        dimension: 'validity',
        evidence: `observed range [${profile.min}, ${profile.max}] with ${(cfg.rangeMarginRatio * 100).toFixed(0)}% margin`,
        // Confidence scales with how many numeric points we saw.
        confidence: Math.min(1, 0.5 + Math.log10(1 + profile.nonNullCount) / 10),
        params: { min: profile.min - margin, max: profile.max + margin },
      });
    }

    // --- enum from low-cardinality top-k ---------------------------------
    if (
      profile.cardinalityRatio <= cfg.enumCardinalityRatio &&
      profile.topK.length > 0 &&
      profile.topK.length <= cfg.maxEnumValues &&
      !profile.cardinalityTruncated
    ) {
      const values = profile.topK.map((t) => t.value);
      out.push({
        ruleKind: 'validity-enum',
        column: profile.column,
        dimension: 'validity',
        evidence: `${profile.topK.length} distinct values cover all observed rows`,
        confidence: Math.min(1, profile.topK.reduce((a, t) => a + t.frequency, 0)),
        params: { allowedValues: values },
      });
    }

    // --- string length bounds -------------------------------------------
    if (profile.stringLengths !== null && profile.stringLengths.min < profile.stringLengths.max) {
      const { min, max } = profile.stringLengths;
      const margin = Math.max(1, Math.round((max - min) * cfg.rangeMarginRatio));
      out.push({
        ruleKind: 'validity-length',
        column: profile.column,
        dimension: 'validity',
        evidence: `observed string lengths [${min}, ${max}]`,
        confidence: 0.8,
        params: { minLength: Math.max(0, min - margin), maxLength: max + margin },
      });
    }

    // --- freshness -------------------------------------------------------
    if (
      profile.dominantPattern?.pattern === StringPattern.ISO_TIMESTAMP &&
      profile.dominantPattern.share >= cfg.patternShareThreshold
    ) {
      out.push({
        ruleKind: 'freshness',
        column: profile.column,
        dimension: 'freshness',
        evidence: `${(profile.dominantPattern.share * 100).toFixed(1)}% of values are ISO timestamps`,
        confidence: profile.dominantPattern.share,
        params: { maxAgeMs: cfg.freshnessMs },
      });
    }

    return out.filter((s) => s.confidence >= cfg.minConfidence);
  }

  /**
   * Suggest for a whole profiled table — flat list sorted by confidence.
   */
  suggestAll(profiles: ReadonlyMap<string, DeepColumnProfile>): SuggestedRule[] {
    const out: SuggestedRule[] = [];
    for (const p of profiles.values()) out.push(...this.suggest(p));
    return out.sort((a, b) => b.confidence - a.confidence);
  }
}
