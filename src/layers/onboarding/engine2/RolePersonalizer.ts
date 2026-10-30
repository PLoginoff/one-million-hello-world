/**
 * Onboarding Engine2 — Role-Based Personalizer
 *
 * The flow engine supports per-step `requiredWhen` predicates — expressive
 * but stringly-typed: every flow author hand-rolls `ctx.role === 'admin'`.
 * Engine2 adds a declarative role model on top:
 *
 *   - `RoleProfile` maps a role to step inclusions/exclusions and default
 *     context data (e.g. product-area defaults for a 'developer').
 *   - `personalize(def, role)` returns a NEW FlowDefinition with steps
 *     filtered and re-linked: removed steps are excised from `next` edges
 *     (linear ids and branch targets alike); edges that would dangle are
 *     re-pointed at the next surviving step in declared order.
 *   - Unknown steps listed in a role's includes/excludes are reported, not
 *     silently ignored — a typo'd exclusion is a bug, not a no-op.
 *
 * Re-linking rule: for each surviving step we resolve its edge against the
 * surviving step-set; a `next` pointing at an excluded step jumps to that
 * step's own resolved successor (transitive skip), falling back to the
 * positional successor, then to undefined (end of flow).
 *
 * Complexity: O(S + E) — one pass over steps, one over edges.
 *
 * @module OnboardingLayer/Engine2
 */

import { FlowDefinition, FlowStep, StepId } from '../flow/FlowTypes';

/** Declarative per-role step policy. */
export interface RoleProfile {
  readonly role: string;
  /**
   * When set, ONLY these steps remain (order preserved from the flow).
   * Mutually exclusive with `exclude`.
   */
  readonly include?: readonly StepId[];
  /** Steps removed for this role. */
  readonly exclude?: readonly StepId[];
  /** Context defaults merged under the user's ctx (user values win). */
  readonly contextDefaults?: Readonly<Record<string, unknown>>;
}

export interface PersonalizeResult {
  readonly flow: FlowDefinition;
  /** Steps removed by the profile. */
  readonly removed: readonly StepId[];
  /** Role-referenced ids that don't exist in the flow. */
  readonly unknownSteps: readonly StepId[];
  readonly profile: RoleProfile;
}

export class RolePersonalizer {
  private readonly _profiles = new Map<string, RoleProfile>();

  register(profile: RoleProfile): void {
    if (profile.include && profile.exclude) {
      throw new Error(`role '${profile.role}': include and exclude are mutually exclusive`);
    }
    this._profiles.set(profile.role, profile);
  }

  profile(role: string): RoleProfile | undefined {
    return this._profiles.get(role);
  }

  /** Apply a registered profile by name. Throws on unknown role. */
  personalize(def: FlowDefinition, role: string): PersonalizeResult {
    const p = this._profiles.get(role);
    if (!p) throw new Error(`unknown role '${role}'`);
    return this.apply(def, p);
  }

  /** Apply an ad-hoc profile (not necessarily registered). */
  apply(def: FlowDefinition, profile: RoleProfile): PersonalizeResult {
    const declared = new Set(def.steps.map((s) => s.id));
    const referenced = new Set<StepId>([
      ...(profile.include ?? []),
      ...(profile.exclude ?? []),
    ]);
    const unknownSteps = [...referenced].filter((id) => !declared.has(id));

    const keep = (id: StepId): boolean => {
      if (profile.include) return profile.include.includes(id);
      if (profile.exclude) return !profile.exclude.includes(id);
      return true;
    };

    const surviving = def.steps.filter((s) => keep(s.id));
    const survivingIds = new Set(surviving.map((s) => s.id));
    const removed = def.steps.filter((s) => !survivingIds.has(s.id)).map((s) => s.id);

    // Positional successor: for each surviving step, the next surviving
    // step in DECLARED order (used when its own edge can't be re-linked).
    const byId = new Map(def.steps.map((s) => [s.id, s]));
    const relinked = surviving.map((step, i) =>
      this._relink(step, byId, survivingIds, surviving, i)
    );

    // If the entry point was removed, the first surviving step starts.
    const start = survivingIds.has(def.start)
      ? def.start
      : (surviving[0]?.id ?? def.start);

    return {
      flow: {
        ...def,
        start,
        steps: relinked,
        // Variant step orders may still name removed steps — drop them
        // rather than carry stale orderings into the engine.
        variants: def.variants?.map((v) => ({
          ...v,
          stepOrder: v.stepOrder?.filter((id) => survivingIds.has(id)),
        })),
      },
      removed,
      unknownSteps,
      profile,
    };
  }

  /**
   * Rewrite one step's `next` against the surviving set.
   * Target resolution: keep if alive; else follow the removed step's own
   * chain (transitive), then the removed step's positional successor.
   */
  private _relink(
    step: FlowStep,
    byId: Map<StepId, FlowStep>,
    alive: ReadonlySet<StepId>,
    surviving: readonly FlowStep[],
    selfIdx: number
  ): FlowStep {
    const resolve = (target: StepId, depth = 0): StepId | undefined => {
      if (depth > byId.size) return undefined; // pathological cycle guard
      if (alive.has(target)) return target;
      const dead = byId.get(target);
      if (!dead) return undefined;
      if (typeof dead.next === 'string') return resolve(dead.next, depth + 1);
      if (Array.isArray(dead.next)) {
        for (const b of dead.next) {
          const r = resolve(b.to, depth + 1);
          if (r !== undefined) return r;
        }
      }
      // Removed step had no usable edge → positional successor.
      const deadIdx = def_order(byId).indexOf(target);
      for (let j = deadIdx + 1; j < def_order(byId).length; j++) {
        const cand = def_order(byId)[j];
        if (alive.has(cand)) return cand;
      }
      return undefined;
    };

    const next = step.next;
    if (next === undefined) return step;

    if (typeof next === 'string') {
      const r = resolve(next);
      return r === next ? step : { ...step, next: r };
    }

    const branches = next
      .map((b) => ({ when: b.when, to: resolve(b.to) }))
      .filter((b): b is { when: typeof b.when; to: StepId } => b.to !== undefined);
    if (branches.length === 0) {
      // Every branch target died — fall back to the next surviving step.
      const fallback = surviving[selfIdx + 1]?.id;
      return { ...step, next: fallback };
    }
    // All branches converged on one surviving step → collapse to a plain
    // edge; the predicate fan-out is dead weight once targets unify.
    if (branches.every((b) => b.to === branches[0].to)) {
      return { ...step, next: branches[0].to };
    }
    return { ...step, next: branches };
  }

  /** Merge a profile's context defaults under user data (user wins). */
  applyContextDefaults(
    profile: RoleProfile,
    userCtx: Readonly<Record<string, unknown>>
  ): Record<string, unknown> {
    return { ...(profile.contextDefaults ?? {}), ...userCtx };
  }
}

/** Map iteration order = declared step order (steps were inserted in order). */
function def_order(byId: Map<StepId, FlowStep>): StepId[] {
  return [...byId.keys()];
}
