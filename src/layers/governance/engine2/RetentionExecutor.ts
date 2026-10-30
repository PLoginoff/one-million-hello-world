/**
 * Retention Executor
 *
 * The *destructive* half of retention: where the existing
 * `RetentionEngine` computes what SHOULD happen to a resource, this
 * executor actually deletes expired resources via a pluggable
 * `deleteFn` — with a legal-hold check that is absolute and a
 * dry-run mode for safe previews.
 *
 * Ordering rule: a resource under ANY active legal hold is never
 * deleted, regardless of age. Retention age is always measured from
 * `createdAt`, never from hold release — matching e-discovery
 * convention (the clock doesn't pause for litigation).
 *
 * When several rules could match a category we apply the one with the
 * LONGEST `retainMs` (most conservative). Rules are stored per category
 * in a Map; {@link run} is O(R + C) where R = resources, C = rules.
 *
 * @module GovernanceLayer/Engine2
 */

import {
  Disposition,
  IClock,
  ManagedResource,
  RetentionRule,
  SystemClock,
} from './types';

export type DeleteFn = (resource: ManagedResource) => void | Promise<void>;

export class RetentionExecutor {
  private readonly _rules: Map<string, RetentionRule>;
  private readonly _resources: Map<string, ManagedResource>;
  /** resourceId -> active hold reasons (non-empty = held). */
  private readonly _holds: Map<string, Set<string>>;
  private readonly _deleter: DeleteFn;
  private readonly _clock: IClock;
  private _deletedCount: number;

  constructor(deleter: DeleteFn, clock: IClock = new SystemClock()) {
    this._rules = new Map();
    this._resources = new Map();
    this._holds = new Map();
    this._deleter = deleter;
    this._clock = clock;
    this._deletedCount = 0;
  }

  /** Register a retention rule (one per category; last wins). */
  addRule(rule: RetentionRule): void {
    const existing = this._rules.get(rule.category);
    // Keep the longer retention — conservative.
    if (!existing || rule.retainMs > existing.retainMs) {
      this._rules.set(rule.category, rule);
    }
  }

  /** Register a resource for management. */
  register(resource: ManagedResource): void {
    this._resources.set(resource.id, resource);
  }

  /** Place a legal hold on a resource (multiple concurrent holds OK). */
  hold(resourceId: string, reason: string): void {
    let s = this._holds.get(resourceId);
    if (!s) {
      s = new Set();
      this._holds.set(resourceId, s);
    }
    s.add(reason);
  }

  /** Release one hold reason. */
  release(resourceId: string, reason: string): void {
    const s = this._holds.get(resourceId);
    if (!s) return;
    s.delete(reason);
    if (s.size === 0) this._holds.delete(resourceId);
  }

  /** True when the resource is under any active hold. */
  isHeld(resourceId: string): boolean {
    return this._holds.has(resourceId);
  }

  /**
   * Run one retention pass. Returns the disposition of every managed
   * resource. With `dryRun` nothing is deleted — the plan is returned
   * so callers can preview what a real run would do.
   */
  async run(dryRun = false): Promise<Disposition[]> {
    const now = this._clock.now();
    const out: Disposition[] = [];
    for (const res of this._resources.values()) {
      const ageMs = now - res.createdAt;
      if (this.isHeld(res.id)) {
        out.push({ resourceId: res.id, action: 'legal-hold', rule: null, ageMs });
        continue;
      }
      const rule = this._rules.get(res.category);
      if (!rule || ageMs <= rule.retainMs) {
        out.push({ resourceId: res.id, action: 'retained', rule: rule?.category ?? null, ageMs });
        continue;
      }
      out.push({ resourceId: res.id, action: 'deleted', rule: rule.category, ageMs });
      if (!dryRun) {
        await this._deleter(res);
        this._resources.delete(res.id);
        this._deletedCount += 1;
      }
    }
    return out;
  }

  /** Number of resources actually deleted so far. */
  deletedCount(): number {
    return this._deletedCount;
  }

  /** Current resource count under management. */
  resourceCount(): number {
    return this._resources.size;
  }
}
