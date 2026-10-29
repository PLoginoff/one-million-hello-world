/**
 * Retention Enforcement Engine
 *
 * Applies retention schedules to a resource registry and computes the
 * disposition (delete / archive / review / retain) of every resource.
 *
 * Legal holds take absolute precedence: a resource under any active hold
 * is always `legal-hold` regardless of schedule, and releasing the hold
 * re-exposes the resource to normal schedule evaluation (retention is
 * measured from original `createdAt`, not hold release — matching the
 * common e-discovery interpretation).
 *
 * When multiple schedules match a category the LONGEST retention wins
 * (conservative — keeps data at least as long as any applicable rule).
 *
 * @module GovernanceLayer/Engines
 */

import {
  DAY_MS,
  DispositionAction,
  DispositionDecision,
  IClock,
  RetainedResource,
  RetentionSchedule,
  SystemClock,
} from './types';

export class RetentionEngine {
  private readonly _schedules: Map<string, RetentionSchedule>;
  private readonly _resources: Map<string, RetainedResource>;
  /** resourceId -> set of hold ids (multiple concurrent holds allowed). */
  private readonly _holds: Map<string, Set<string>>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._schedules = new Map();
    this._resources = new Map();
    this._holds = new Map();
    this._clock = clock;
  }

  addSchedule(schedule: RetentionSchedule): void {
    if (schedule.retentionDays < 0) {
      throw new Error('retentionDays must be >= 0');
    }
    this._schedules.set(schedule.id, { ...schedule });
  }

  removeSchedule(scheduleId: string): boolean {
    return this._schedules.delete(scheduleId);
  }

  registerResource(resource: RetainedResource): void {
    this._resources.set(resource.resourceId, { ...resource });
  }

  unregisterResource(resourceId: string): boolean {
    this._holds.delete(resourceId);
    return this._resources.delete(resourceId);
  }

  /** Place a legal hold. Idempotent per holdId. */
  placeHold(resourceId: string, holdId: string): void {
    if (!this._resources.has(resourceId)) {
      throw new Error(`Unknown resource: ${resourceId}`);
    }
    let holds = this._holds.get(resourceId);
    if (!holds) {
      holds = new Set();
      this._holds.set(resourceId, holds);
    }
    holds.add(holdId);
  }

  /** Release one hold. Resource remains held while other holds exist. */
  releaseHold(resourceId: string, holdId: string): boolean {
    const holds = this._holds.get(resourceId);
    if (!holds) return false;
    const removed = holds.delete(holdId);
    if (holds.size === 0) this._holds.delete(resourceId);
    return removed;
  }

  isHeld(resourceId: string): boolean {
    const holds = this._holds.get(resourceId);
    return holds !== undefined && holds.size > 0;
  }

  /**
   * Effective schedule for a category: the one with the longest
   * retentionDays among matching schedules, or null.
   */
  effectiveSchedule(category: string): RetentionSchedule | null {
    let best: RetentionSchedule | null = null;
    for (const s of this._schedules.values()) {
      if (s.category !== category) continue;
      if (best === null || s.retentionDays > best.retentionDays) best = s;
    }
    return best;
  }

  /** Compute the disposition of one resource right now. */
  evaluate(resourceId: string): DispositionDecision {
    const resource = this._resources.get(resourceId);
    if (!resource) throw new Error(`Unknown resource: ${resourceId}`);

    if (this.isHeld(resourceId)) {
      return {
        resourceId,
        action: DispositionAction.LegalHold,
        scheduleId: null,
        reason: 'active legal hold overrides retention schedule',
      };
    }

    const schedule = this.effectiveSchedule(resource.category);
    if (!schedule) {
      return {
        resourceId,
        action: DispositionAction.Retain,
        scheduleId: null,
        reason: `no retention schedule for category '${resource.category}'`,
      };
    }

    const ageMs = this._clock.now() - resource.createdAt;
    const retentionMs = schedule.retentionDays * DAY_MS;

    if (ageMs < retentionMs) {
      return {
        resourceId,
        action: DispositionAction.Retain,
        scheduleId: schedule.id,
        reason: `within retention period (${Math.floor(ageMs / DAY_MS)}d of ${schedule.retentionDays}d)`,
      };
    }

    const action =
      schedule.disposition === 'delete'
        ? DispositionAction.Delete
        : schedule.disposition === 'archive'
          ? DispositionAction.Archive
          : DispositionAction.Review;

    return {
      resourceId,
      action,
      scheduleId: schedule.id,
      reason: `retention period elapsed (${Math.floor(ageMs / DAY_MS)}d >= ${schedule.retentionDays}d)`,
    };
  }

  /**
   * Evaluate every registered resource. Results are grouped by action for
   * convenient downstream processing (e.g. a deletion worker consumes
   * `byAction.delete`).
   */
  evaluateAll(): { decisions: DispositionDecision[]; byAction: Map<DispositionAction, string[]> } {
    const decisions: DispositionDecision[] = [];
    const byAction = new Map<DispositionAction, string[]>();
    for (const id of this._resources.keys()) {
      const d = this.evaluate(id);
      decisions.push(d);
      const bucket = byAction.get(d.action);
      if (bucket) bucket.push(id);
      else byAction.set(d.action, [id]);
    }
    return { decisions, byAction };
  }
}
