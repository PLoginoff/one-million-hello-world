/**
 * Flow Graph
 *
 * Validates and traverses a {@link FlowDefinition} step graph: linear edges,
 * conditional branches, and variant-driven reordering.
 *
 * Graph rules enforced at construction:
 *  - `start` exists in `steps`
 *  - all edge targets exist
 *  - no duplicate step ids
 *  - variant `stepOrder` is a permutation of step ids (when present)
 *
 * Traversal uses the resolved step ORDER for a run — the variant order when
 * assigned, else the declaration order — and resolves `next` edges to find
 * the following ACTIVE step (skipping steps excluded by `requiredWhen`).
 *
 * @module OnboardingLayer/Flow
 */

import {
  Branch,
  FlowDefinition,
  FlowError,
  FlowStep,
  FlowVariant,
  Predicate,
  StepId,
} from './FlowTypes';

export class FlowGraph {
  readonly definition: FlowDefinition;
  private readonly _steps = new Map<StepId, FlowStep>();
  private readonly _variants = new Map<string, FlowVariant>();

  constructor(definition: FlowDefinition) {
    this._validate(definition);
    this.definition = definition;
    for (const s of definition.steps) this._steps.set(s.id, s);
    for (const v of definition.variants ?? []) this._variants.set(v.variantId, v);
  }

  step(id: StepId): FlowStep | null {
    return this._steps.get(id) ?? null;
  }

  variant(id: string): FlowVariant | null {
    return this._variants.get(id) ?? null;
  }

  /** All step ids in declaration order. */
  get stepIds(): StepId[] {
    return this.definition.steps.map((s) => s.id);
  }

  /**
   * Resolve the ordered step list for a run. A variant with `stepOrder`
   * reorders; steps excluded by `requiredWhen` are filtered out for `ctx`.
   */
  resolveOrder(variantId: string | null, ctx: Readonly<Record<string, unknown>>): StepId[] {
    const base =
      variantId !== null && this._variants.get(variantId)?.stepOrder
        ? [...this._variants.get(variantId)!.stepOrder!]
        : this.stepIds;
    return base.filter((id) => {
      const s = this._steps.get(id)!;
      return s.requiredWhen === undefined || s.requiredWhen(ctx);
    });
  }

  /**
   * Find the index in `order` of the step reached by following `from`'s
   * `next` edge under `ctx`. Returns order.length when the flow ends.
   *
   * Steps whose `requiredWhen` is false for ctx are never in `order`, so
   * "next" naturally lands on the next included step.
   */
  nextIndex(
    fromId: StepId,
    order: readonly StepId[],
    ctx: Readonly<Record<string, unknown>>
  ): number {
    const step = this._steps.get(fromId);
    if (!step) return order.length;
    const target = this._resolveNext(step, ctx);
    if (target === null) return order.length;
    const idx = order.indexOf(target);
    if (idx === -1) {
      // Target exists in graph but excluded for this ctx — recurse past it.
      return this.nextIndex(target, order, ctx);
    }
    return idx;
  }

  /**
   * Resolve `step.next` to a concrete StepId (first matching branch wins),
   * or null when the flow ends.
   */
  private _resolveNext(step: FlowStep, ctx: Readonly<Record<string, unknown>>): StepId | null {
    const next = step.next;
    if (next === undefined) return null;
    if (typeof next === 'string') return next;
    for (const b of next as readonly Branch[]) {
      if (b.when(ctx)) return b.to;
    }
    return null; // no branch matched → end
  }

  /**
   * Steps reachable from `start` ignoring predicates (structural reachability).
   * Used by validation to flag orphan steps.
   */
  reachable(): Set<StepId> {
    const seen = new Set<StepId>();
    const queue: StepId[] = [this.definition.start];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const s = this._steps.get(id);
      if (!s?.next) continue;
      if (typeof s.next === 'string') queue.push(s.next);
      else for (const b of s.next) queue.push(b.to);
    }
    return seen;
  }

  private _validate(d: FlowDefinition): void {
    if (!d.flowId) throw new FlowError('INVALID_FLOW', 'flowId required');
    const ids = new Set<StepId>();
    for (const s of d.steps) {
      if (ids.has(s.id)) {
        throw new FlowError('INVALID_FLOW', `duplicate step id '${s.id}'`);
      }
      ids.add(s.id);
    }
    if (!ids.has(d.start)) {
      throw new FlowError('INVALID_FLOW', `start step '${d.start}' not in steps`);
    }
    for (const s of d.steps) {
      const targets: StepId[] =
        s.next === undefined ? [] : typeof s.next === 'string' ? [s.next] : s.next.map((b) => b.to);
      for (const t of targets) {
        if (!ids.has(t)) {
          throw new FlowError('INVALID_FLOW', `step '${s.id}' points to unknown step '${t}'`);
        }
      }
    }
    const allIds = d.steps.map((s) => s.id).sort().join(',');
    for (const v of d.variants ?? []) {
      if (v.weight < 0 || v.weight > 1) {
        throw new FlowError('INVALID_FLOW', `variant '${v.variantId}' weight must be in [0,1]`);
      }
      if (v.stepOrder) {
        const sorted = [...v.stepOrder].sort().join(',');
        if (sorted !== allIds) {
          throw new FlowError('INVALID_FLOW', `variant '${v.variantId}' stepOrder must permute all steps`);
        }
      }
    }
    const totalWeight = (d.variants ?? []).reduce((s, v) => s + v.weight, 0);
    if (totalWeight > 1 + 1e-9) {
      throw new FlowError('INVALID_FLOW', `variant weights sum to ${totalWeight} > 1`);
    }
  }
}

/**
 * Deterministic variant assignment: hash (userId|flowId) into [0,1) and
 * walk cumulative weights. Same user+flow always lands in the same bucket.
 * Returns null when the hash falls past the summed weights (control group).
 */
export function assignVariant(userId: string, flow: FlowDefinition): string | null {
  const variants = flow.variants ?? [];
  if (variants.length === 0) return null;
  const hash = fnv1a(`${userId}|${flow.flowId}`);
  // Map to [0,1)
  const bucket = parseInt(hash, 16) / 0xffffffff;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (bucket < cumulative) return v.variantId;
  }
  return null;
}

/** FNV-1a — same hash as the notification dedup store, duplicated to keep layers independent. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
