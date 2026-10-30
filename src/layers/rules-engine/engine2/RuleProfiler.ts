/**
 * Rules Engine — Per-Rule Performance Profiler
 *
 * Wraps rule-condition evaluation to measure cost per rule and per
 * condition subtree, answering "why is this rule set slow?":
 *
 *  - `profiled(rule, facts)` times one evaluation with the injected
 *    high-resolution clock (defaults to `performance.now`, injectable
 *    for tests) and accumulates running stats per rule.
 *  - Stats per rule: calls, total/mean/min/max eval time, p50/p99 of
 *    recorded durations, match rate (fraction returning true).
 *  - `conditionBreakdown(rule, facts)` decomposes a condition tree into
 *    per-node timings — the leaf that dominates evaluation is findable
 *    without guessing (usually the `matches` regex on a hot field).
 *  - `slowest(n)` and `hotspots()` surface the worst offenders for the
 *    optimization loop: hoist expensive leaves behind cheap ones, or
 *    move them into the alpha network's shared nodes.
 *
 * Timing overhead: one clock read per profiled call — sub-microsecond on
 * modern runtimes, safe to leave on in production sampling mode.
 *
 * @module RulesEngine/Engine2
 */

import { Condition, evaluateCondition } from '../domain/dsl';
import { VersionedRule } from './RuleVersionStore';

export interface RuleProfileStats {
  readonly ruleId: string;
  readonly calls: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
  /** Fraction of calls where the condition evaluated true. */
  readonly matchRate: number;
}

/** Per-node timing inside one condition tree. */
export interface ConditionNodeTiming {
  /** Node path like `and.0.leaf` — position in the tree. */
  readonly path: string;
  readonly kind: string;
  /** For leaves: `field op value` summary. */
  readonly summary: string;
  readonly durationMs: number;
  readonly result: boolean;
}

interface MutableStats {
  calls: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  matches: number;
  durations: number[]; // bounded reservoir for percentiles
}

const MAX_DURATIONS = 4096;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

export class RuleProfiler {
  private readonly _clock: () => number;
  private readonly _stats = new Map<string, MutableStats>();

  constructor(clock: () => number = () => performance.now()) {
    this._clock = clock;
  }

  /**
   * Evaluate a rule's condition against `facts`, recording the timing.
   * Returns the boolean result — the profiler is transparent.
   */
  profiled(rule: VersionedRule, facts: Record<string, unknown>): boolean {
    const t0 = this._clock();
    const result = evaluateCondition(rule.condition, facts);
    const dt = this._clock() - t0;
    this._record(rule.id, dt, result);
    return result;
  }

  /** Record an externally measured duration (for caller-timed integrations). */
  recordExternal(ruleId: string, durationMs: number, matched: boolean): void {
    this._record(ruleId, durationMs, matched);
  }

  private _record(ruleId: string, durationMs: number, matched: boolean): void {
    let s = this._stats.get(ruleId);
    if (!s) {
      s = { calls: 0, totalMs: 0, minMs: Infinity, maxMs: -Infinity, matches: 0, durations: [] };
      this._stats.set(ruleId, s);
    }
    s.calls++;
    s.totalMs += durationMs;
    s.minMs = Math.min(s.minMs, durationMs);
    s.maxMs = Math.max(s.maxMs, durationMs);
    if (matched) s.matches++;
    s.durations.push(durationMs);
    if (s.durations.length > MAX_DURATIONS) {
      // Keep the most recent half — retains percentile accuracy for
      // recent traffic without unbounded growth.
      s.durations.splice(0, s.durations.length - MAX_DURATIONS / 2);
    }
  }

  /** Stats for one rule. */
  stats(ruleId: string): RuleProfileStats | undefined {
    const s = this._stats.get(ruleId);
    if (!s) return undefined;
    const sorted = [...s.durations].sort((a, b) => a - b);
    return {
      ruleId,
      calls: s.calls,
      totalMs: s.totalMs,
      meanMs: s.calls === 0 ? 0 : s.totalMs / s.calls,
      minMs: s.calls === 0 ? 0 : s.minMs,
      maxMs: s.calls === 0 ? 0 : s.maxMs,
      p50Ms: percentile(sorted, 0.5),
      p99Ms: percentile(sorted, 0.99),
      matchRate: s.calls === 0 ? 0 : s.matches / s.calls,
    };
  }

  /** All tracked rules sorted by totalMs desc — worst offenders first. */
  slowest(n = 10): ReadonlyArray<RuleProfileStats> {
    return [...this._stats.keys()]
      .map((id) => this.stats(id)!)
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, n);
  }

  /**
   * Time each node of a condition tree independently. For `and`/`or` we
   * time each child; the node total is the sum of children plus a tiny
   * composition overhead. NOT short-circuited — every node is evaluated
   * so the breakdown is complete (use on sampled facts, not hot paths).
   */
  conditionBreakdown(condition: Condition, facts: Record<string, unknown>): ConditionNodeTiming[] {
    const out: ConditionNodeTiming[] = [];
    const walk = (c: Condition, path: string): boolean => {
      const t0 = this._clock();
      let result: boolean;
      if (c.kind === 'leaf') {
        result = evaluateCondition(c, facts);
      } else if (c.kind === 'not') {
        // Evaluate the child for its own timing, negate for ours.
        const child = c.children[0];
        result = child === undefined ? false : !walk(child, `${path}.0`);
      } else {
        // and/or: evaluate ALL children (no short-circuit — the point is
        // per-node cost, not the answer) then combine with real semantics.
        const childResults = c.children.map((child, i) => walk(child, `${path}.${i}`));
        result = c.kind === 'and' ? childResults.every(Boolean) : childResults.some(Boolean);
      }
      const dt = this._clock() - t0;
      out.push({
        path,
        kind: c.kind,
        summary:
          c.kind === 'leaf'
            ? `${c.field} ${c.op} ${JSON.stringify(c.value)}`
            : `${c.kind}(${c.children.length} children)`,
        durationMs: dt,
        result,
      });
      return result;
    };
    walk(condition, 'root');
    return out;
  }

  /** Rules whose p99 exceeds `thresholdMs` — the optimization shortlist. */
  hotspots(thresholdMs: number): ReadonlyArray<RuleProfileStats> {
    return [...this._stats.keys()]
      .map((id) => this.stats(id)!)
      .filter((s) => s.p99Ms >= thresholdMs)
      .sort((a, b) => b.p99Ms - a.p99Ms);
  }

  reset(): void {
    this._stats.clear();
  }
}
