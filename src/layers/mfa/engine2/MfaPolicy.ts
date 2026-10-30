/**
 * MFA Policy Engine
 *
 * Declarative rules that decide whether MFA is required for a
 * (user, action, resource) triple, and which factors satisfy the
 * requirement.
 *
 * Model
 * -----
 *  - `PolicyRule`s are evaluated in priority order (lower `priority`
 *    number wins); first match applies — like firewall rules.
 *  - Match dimensions: user glob (`user:*`, `user:admin-*`), action glob
 *    (`payment.*`), resource glob, plus optional group membership.
 *  - A matched rule yields a `Requirement`: which factor classes are
 *    acceptable (`any-of` / `all-of`) and whether a "fresh" factor is
 *    needed (max auth age, e.g. step-up for wire transfers).
 *  - No match → the engine's `defaultRequirement` (default: no MFA).
 *
 * Glob matching: `*` matches any sequence within a segment, `**` spans
 * segments. Dot-separated segments (`payment.wire.create`).
 *
 * @module Mfa/Engine2
 */

/** Which factors a rule accepts. */
export interface FactorSet {
  /** 'any-of': one listed factor suffices. 'all-of': every listed factor
   *  must be presented. */
  readonly mode: 'any-of' | 'all-of';
  readonly factors: readonly string[];
  /** Max age in ms since the factor was asserted; 0/undefined = any age. */
  readonly maxAgeMs?: number;
}

export interface PolicyRule {
  readonly id: string;
  readonly priority: number;
  /** Glob patterns; undefined matches everything. */
  readonly user?: string;
  readonly action?: string;
  readonly resource?: string;
  /** Only applies when the user is in one of these groups. */
  readonly groups?: readonly string[];
  readonly requirement: FactorSet;
  readonly description?: string;
}

export interface PolicyRequest {
  readonly user: string;
  readonly action: string;
  readonly resource?: string;
  readonly groups?: readonly string[];
}

export interface PolicyDecision {
  readonly required: boolean;
  readonly ruleId?: string;
  readonly requirement?: FactorSet;
  readonly reason: string;
}

/** One factor the caller already asserted, for satisfaction checking. */
export interface AssertedFactor {
  readonly factor: string;
  readonly assertedAt: number;
}

export class MfaPolicyEngine {
  private readonly rules: PolicyRule[] = [];
  private readonly defaultRequirement: FactorSet | null;

  constructor(defaultRequirement: FactorSet | null = null) {
    this.defaultRequirement = defaultRequirement;
  }

  /** Add a rule; kept sorted by priority — O(n log n) insert via re-sort. */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  removeRule(id: string): boolean {
    const i = this.rules.findIndex((r) => r.id === id);
    if (i < 0) return false;
    this.rules.splice(i, 1);
    return true;
  }

  /** Evaluate a request — first matching rule wins. */
  evaluate(req: PolicyRequest): PolicyDecision {
    for (const rule of this.rules) {
      if (!globMatch(rule.user, req.user)) continue;
      if (!globMatch(rule.action, req.action)) continue;
      if (rule.resource !== undefined && !globMatch(rule.resource, req.resource ?? '')) continue;
      if (rule.groups !== undefined) {
        const inGroup = rule.groups.some((g) => (req.groups ?? []).includes(g));
        if (!inGroup) continue;
      }
      return {
        required: true,
        ruleId: rule.id,
        requirement: rule.requirement,
        reason: rule.description ?? `matched rule ${rule.id}`,
      };
    }
    if (this.defaultRequirement) {
      return {
        required: true,
        requirement: this.defaultRequirement,
        reason: 'default requirement',
      };
    }
    return { required: false, reason: 'no rule matched' };
  }

  /**
   * Check whether a set of already-asserted factors satisfies a decision.
   * `now` is injectable for maxAge checks.
   */
  satisfies(
    decision: PolicyDecision,
    asserted: readonly AssertedFactor[],
    now: number = Date.now()
  ): { readonly ok: boolean; readonly missing: readonly string[]; readonly stale: readonly string[] } {
    if (!decision.required || !decision.requirement) {
      return { ok: true, missing: [], stale: [] };
    }
    const req = decision.requirement;
    const byFactor = new Map<string, number>();
    for (const a of asserted) byFactor.set(a.factor, a.assertedAt);

    const missing: string[] = [];
    const stale: string[] = [];
    const check = (factor: string): boolean => {
      const at = byFactor.get(factor);
      if (at === undefined) {
        missing.push(factor);
        return false;
      }
      if (req.maxAgeMs !== undefined && req.maxAgeMs > 0 && now - at > req.maxAgeMs) {
        stale.push(factor);
        return false;
      }
      return true;
    };

    if (req.mode === 'any-of') {
      // Satisfied if ANY listed factor is present and fresh.
      const anyOk = req.factors.some((f) => {
        const at = byFactor.get(f);
        return at !== undefined && (req.maxAgeMs === undefined || req.maxAgeMs === 0 || now - at <= req.maxAgeMs);
      });
      if (!anyOk) {
        return { ok: false, missing: req.factors.slice(), stale: [] };
      }
      return { ok: true, missing: [], stale: [] };
    }
    // all-of: every factor must be present and fresh.
    let ok = true;
    for (const f of req.factors) {
      if (!check(f)) ok = false;
    }
    return { ok, missing, stale };
  }

  /** List rules in priority order. */
  listRules(): readonly PolicyRule[] {
    return this.rules.slice();
  }
}

/**
 * Glob match. `*` within a segment; `**` across segments.
 * Returns true when pattern is undefined (wildcard-all).
 * O(pattern × value) with a memo-free recursive segment walk — patterns
 * here are tiny, so this stays fast.
 */
export function globMatch(pattern: string | undefined, value: string): boolean {
  if (pattern === undefined) return true;
  const p = pattern.split('.');
  const v = value.split('.');
  return matchSeg(p, 0, v, 0);
}

function matchSeg(p: readonly string[], pi: number, v: readonly string[], vi: number): boolean {
  if (pi === p.length) return vi === v.length;
  const seg = p[pi];
  if (seg === '**') {
    // Consume zero or more value segments.
    for (let skip = 0; vi + skip <= v.length; skip++) {
      if (matchSeg(p, pi + 1, v, vi + skip)) return true;
    }
    return false;
  }
  if (vi >= v.length) return false;
  if (!segMatch(seg, v[vi])) return false;
  return matchSeg(p, pi + 1, v, vi + 1);
}

/** Single-segment glob: `*` matches any run of characters. */
function segMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  // Classic wildcard match with backtracking — O(p·v) worst case.
  let pi = 0,
    vi = 0,
    starP = -1,
    starV = -1;
  while (vi < value.length) {
    if (pi < pattern.length && (pattern[pi] === value[vi] || pattern[pi] === '?')) {
      pi++;
      vi++;
    } else if (pi < pattern.length && pattern[pi] === '*') {
      starP = pi++;
      starV = vi;
    } else if (starP >= 0) {
      pi = starP + 1;
      vi = ++starV;
    } else {
      return false;
    }
  }
  while (pi < pattern.length && pattern[pi] === '*') pi++;
  return pi === pattern.length;
}
