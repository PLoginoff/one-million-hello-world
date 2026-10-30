/**
 * FalsePositiveTracker — FP accounting and per-rule path allowlists.
 *
 * When an operator marks a block as a false positive, the tracker:
 *  - increments the FP count for the rule
 *  - optionally auto-allowlists the exact path when a rule's FP count
 *    on that path crosses `autoAllowThreshold`
 *
 * `isAllowed(ruleId, path)` checks the allowlist first — allowlisted
 * paths bypass the rule entirely. Allowlist entries are exact paths or
 * glob-style prefixes ("api/v1/*").
 *
 * FP rate = fpCount / blockCount per rule, surfaced for tuning dashboards.
 *
 * @module WafLayer/Engine2
 */

export interface FalsePositiveOptions {
  /** FPs on one path before it's auto-allowlisted. 0 = manual only. */
  autoAllowThreshold?: number;
}

interface RuleFp {
  blocks: number;
  fps: number;
  /** path → fp count on that path */
  perPath: Map<string, number>;
}

interface AllowEntry {
  readonly pattern: string;
  readonly isPrefix: boolean;
  readonly addedAtFpCount: number;
}

export class FalsePositiveTracker {
  private readonly _autoThreshold: number;
  private readonly _rules = new Map<string, RuleFp>();
  private readonly _allowlists = new Map<string, AllowEntry[]>();

  constructor(opts: FalsePositiveOptions = {}) {
    this._autoThreshold = Math.max(0, opts.autoAllowThreshold ?? 0);
  }

  /** Record that a rule fired (blocked). Call before knowing FP status. */
  recordBlock(ruleId: string): void {
    this._rule(ruleId).blocks++;
  }

  /**
   * Record a false positive. If autoAllowThreshold > 0 and the path has
   * accumulated enough FPs, it's allowlisted automatically. Returns true
   * when this call triggered an auto-allowlist.
   */
  recordFalsePositive(ruleId: string, path: string): boolean {
    const r = this._rule(ruleId);
    r.fps++;
    const n = (r.perPath.get(path) ?? 0) + 1;
    r.perPath.set(path, n);
    if (this._autoThreshold > 0 && n >= this._autoThreshold && !this.isAllowed(ruleId, path)) {
      this.allow(ruleId, path, n);
      return true;
    }
    return false;
  }

  /** Manually allowlist a path (exact) or prefix (trailing '*'). */
  allow(ruleId: string, pattern: string, atFpCount = 0): void {
    const isPrefix = pattern.endsWith('*');
    const list = this._allowlists.get(ruleId) ?? [];
    const normalized = isPrefix ? pattern.slice(0, -1) : pattern;
    if (!list.some((e) => e.pattern === normalized && e.isPrefix === isPrefix)) {
      list.push({ pattern: normalized, isPrefix, addedAtFpCount: atFpCount });
      this._allowlists.set(ruleId, list);
    }
  }

  /** Remove an allowlist entry. Returns true when one was removed. */
  disallow(ruleId: string, pattern: string): boolean {
    const list = this._allowlists.get(ruleId);
    if (!list) return false;
    const isPrefix = pattern.endsWith('*');
    const normalized = isPrefix ? pattern.slice(0, -1) : pattern;
    const i = list.findIndex((e) => e.pattern === normalized && e.isPrefix === isPrefix);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  /** Does an allowlist entry exempt this path from the rule? */
  isAllowed(ruleId: string, path: string): boolean {
    const list = this._allowlists.get(ruleId);
    if (!list) return false;
    return list.some((e) => (e.isPrefix ? path.startsWith(e.pattern) : path === e.pattern));
  }

  /** FP rate for a rule: fps / blocks, 0 when no blocks. */
  fpRate(ruleId: string): number {
    const r = this._rules.get(ruleId);
    if (!r || r.blocks === 0) return 0;
    return r.fps / r.blocks;
  }

  /** All allowlist patterns for a rule. */
  allowlist(ruleId: string): readonly string[] {
    return (this._allowlists.get(ruleId) ?? []).map((e) => (e.isPrefix ? e.pattern + '*' : e.pattern));
  }

  /** Per-rule counters for dashboards. */
  stats(ruleId: string): { blocks: number; fps: number; topFpPaths: [string, number][] } {
    const r = this._rules.get(ruleId);
    if (!r) return { blocks: 0, fps: 0, topFpPaths: [] };
    const top = [...r.perPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { blocks: r.blocks, fps: r.fps, topFpPaths: top };
  }

  /* ---------------------------------------------------------------- */

  private _rule(id: string): RuleFp {
    let r = this._rules.get(id);
    if (!r) {
      r = { blocks: 0, fps: 0, perPath: new Map() };
      this._rules.set(id, r);
    }
    return r;
  }
}
