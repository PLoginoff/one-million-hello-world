/**
 * Policy Composition Engine
 *
 * Combines partial decisions from multiple evaluation sources — RBAC,
 * hierarchy, temporal windows, obligation gates — under a configurable
 * combining algorithm. XACML's combining algorithms, distilled:
 *
 *  - `deny-overrides`  (default) — any deny wins; allow if ≥1 allow
 *  - `permit-overrides` — any allow wins; deny if ≥1 deny
 *  - `first-applicable` — sources in order; first non-NA decides
 *  - `only-one-applicable` — exactly one source must decide; else error
 *
 * Each source returns a `PartialVerdict` — allow, deny, or NA (no
 * opinion). The composer resolves ties deterministically and records
 * which sources contributed, for the access journal.
 *
 * @module AuthorizationLayer/Engine2
 */

export type Verdict = 'allow' | 'deny' | 'na';

export interface PartialVerdict {
  readonly source: string;
  readonly verdict: Verdict;
  /** Optional per-source reason — rolled into the composite reason. */
  readonly reason?: string;
}

export type CombiningAlgorithm =
  | 'deny-overrides'
  | 'permit-overrides'
  | 'first-applicable'
  | 'only-one-applicable';

export interface CompositeDecision {
  readonly allowed: boolean;
  readonly verdict: 'allow' | 'deny';
  /** How the verdict was reached. */
  readonly algorithm: CombiningAlgorithm;
  /** Which sources contributed the decisive verdict(s). */
  readonly decisiveSources: readonly string[];
  /** All partial verdicts — the full picture for audit. */
  readonly partials: readonly PartialVerdict[];
  readonly reason: string;
}

export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositionError';
  }
}

export class PolicyComposer {
  private readonly _algorithm: CombiningAlgorithm;

  constructor(algorithm: CombiningAlgorithm = 'deny-overrides') {
    this._algorithm = algorithm;
  }

  /**
   * Combine partial verdicts under the configured algorithm.
   * All-NA is a deny (fail-safe) except under only-one-applicable,
   * which raises CompositionError.
   */
  combine(partials: readonly PartialVerdict[]): CompositeDecision {
    const applicable = partials.filter((p) => p.verdict !== 'na');

    switch (this._algorithm) {
      case 'deny-overrides': {
        const denies = applicable.filter((p) => p.verdict === 'deny');
        const allows = applicable.filter((p) => p.verdict === 'allow');
        if (denies.length > 0) {
          return this.decision(false, denies, `denied by ${denies.map((d) => d.source).join(',')}`, partials);
        }
        if (allows.length > 0) {
          return this.decision(true, allows, `allowed by ${allows.map((a) => a.source).join(',')}`, partials);
        }
        return this.decision(false, [], 'no applicable verdict (fail-safe deny)', partials);
      }
      case 'permit-overrides': {
        const allows = applicable.filter((p) => p.verdict === 'allow');
        if (allows.length > 0) {
          return this.decision(true, allows, `allowed by ${allows.map((a) => a.source).join(',')}`, partials);
        }
        const denies = applicable.filter((p) => p.verdict === 'deny');
        return this.decision(false, denies, denies.length > 0 ? `denied` : 'no applicable verdict', partials);
      }
      case 'first-applicable': {
        if (applicable.length === 0) {
          return this.decision(false, [], 'no applicable verdict', partials);
        }
        const first = applicable[0];
        return this.decision(
          first.verdict === 'allow',
          [first],
          `${first.source} decided ${first.verdict}`,
          partials
        );
      }
      case 'only-one-applicable': {
        if (applicable.length === 0) {
          throw new CompositionError('only-one-applicable: no applicable source');
        }
        if (applicable.length > 1) {
          throw new CompositionError(
            `only-one-applicable: ${applicable.length} sources applicable (${applicable.map((a) => a.source).join(',')})`
          );
        }
        const only = applicable[0];
        return this.decision(
          only.verdict === 'allow',
          [only],
          `${only.source} solely decided`,
          partials
        );
      }
    }
  }

  private decision(
    allowed: boolean,
    decisive: readonly PartialVerdict[],
    reason: string,
    partials: readonly PartialVerdict[]
  ): CompositeDecision {
    return {
      allowed,
      verdict: allowed ? 'allow' : 'deny',
      algorithm: this._algorithm,
      decisiveSources: decisive.map((d) => d.source),
      partials,
      reason,
    };
  }
}
