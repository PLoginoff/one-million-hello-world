/**
 * Cost Inventory & Attribution Engine
 *
 * Maintains the resource inventory (with hourly costs and tags) and
 * attributes spend to cost centers via an ordered rule set.
 *
 * Attribution algorithm: rules are evaluated in registration order; the
 * first rule whose tag is present on the resource produces the cost
 * center (via mapping lookup, '*' catch-all, or the rule's fallback).
 * Resources matching no rule land in the configurable `unattributed`
 * bucket — a real FinOps anti-pattern worth surfacing, not hiding.
 *
 * Aggregation is O(R·T) per breakdown where R = active resources and
 * T = tags per resource (Map lookups are O(1) each).
 *
 * @module CostOptimizationLayer/Engines
 */

import {
  AttributionRule,
  CostBreakdown,
  IClock,
  Resource,
  SystemClock,
} from './types';

export class CostInventoryEngine {
  private readonly _resources: Map<string, Resource>;
  private _rules: AttributionRule[];
  private _unattributedLabel: string;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock(), unattributedLabel: string = 'unattributed') {
    this._resources = new Map();
    this._rules = [];
    this._unattributedLabel = unattributedLabel;
    this._clock = clock;
  }

  upsertResource(resource: Resource): void {
    this._resources.set(resource.id, { ...resource, tags: { ...resource.tags } });
  }

  removeResource(resourceId: string): boolean {
    return this._resources.delete(resourceId);
  }

  getResource(resourceId: string): Resource | null {
    return this._resources.get(resourceId) ?? null;
  }

  /** Add an attribution rule; rules are evaluated in registration order. */
  addAttributionRule(rule: AttributionRule): void {
    this._rules.push({ tagKey: rule.tagKey, mapping: { ...rule.mapping }, fallback: rule.fallback });
  }

  /**
   * Resolve which cost center a resource bills to.
   * Returns the unattributed label when no rule matches.
   */
  attribute(resourceId: string): string {
    const resource = this._resources.get(resourceId);
    if (!resource) throw new Error(`Unknown resource: ${resourceId}`);

    for (const rule of this._rules) {
      const tagValue = resource.tags[rule.tagKey];
      if (tagValue === undefined) continue;
      const mapped = rule.mapping[tagValue] ?? rule.mapping['*'];
      if (mapped !== undefined) return mapped;
      if (rule.fallback !== null) return rule.fallback;
    }
    return this._unattributedLabel;
  }

  /**
   * Group all active resources by cost center with hourly spend.
   * Sorted by spend descending — the biggest cost centers first.
   */
  breakdown(): CostBreakdown[] {
    const buckets = new Map<string, { count: number; cents: number; ids: string[] }>();
    for (const r of this._resources.values()) {
      if (!r.active) continue;
      const cc = this.attribute(r.id);
      let bucket = buckets.get(cc);
      if (!bucket) {
        bucket = { count: 0, cents: 0, ids: [] };
        buckets.set(cc, bucket);
      }
      bucket.count++;
      bucket.cents += r.hourlyCostCents;
      bucket.ids.push(r.id);
    }
    return [...buckets.entries()]
      .map(([costCenter, b]) => ({
        costCenter,
        resourceCount: b.count,
        hourlyCostCents: b.cents,
        resourceIds: b.ids,
      }))
      .sort((a, b) => b.hourlyCostCents - a.hourlyCostCents);
  }

  /** Total fleet hourly burn (cents/hour) across active resources. */
  totalHourlyCostCents(): number {
    let total = 0;
    for (const r of this._resources.values()) {
      if (r.active) total += r.hourlyCostCents;
    }
    return total;
  }

  /** Resources that landed in the unattributed bucket. */
  unattributedResources(): Resource[] {
    return [...this._resources.values()].filter(
      (r) => r.active && this.attribute(r.id) === this._unattributedLabel
    );
  }

  /** Percentage of hourly spend that is attributed (0-100). */
  attributionCoveragePct(): number {
    const total = this.totalHourlyCostCents();
    if (total === 0) return 100;
    const unattributed = this.unattributedResources().reduce(
      (sum, r) => sum + r.hourlyCostCents,
      0
    );
    return ((total - unattributed) / total) * 100;
  }
}
