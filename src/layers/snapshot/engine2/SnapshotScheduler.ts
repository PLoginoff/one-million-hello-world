/**
 * SnapshotScheduler — cron-like snapshot scheduling with retention hooks.
 *
 * Schedules periodic snapshots on named jobs. Each job carries a cron
 * expression (standard 5-field: minute hour day-of-month month
 * day-of-week) plus snapshot options (kind, labels). `tick(nowMs)`
 * evaluates every job's next-due instant against the clock and takes
 * the snapshots that came due — pure, deterministic, fully testable
 * with an injected clock.
 *
 * Retention: after a successful snapshot the scheduler hands the
 * manager's snapshot list to a pluggable retention evaluator (the
 * existing `RetentionPolicy`, or any `RetentionEvaluator`), then
 * deletes the snapshots the plan evicts — UNLESS they are a chain
 * parent of a kept incremental (deleting a parent orphans children,
 * so eviction of a non-leaf is skipped and reported).
 *
 * Cron engine: field parser supporting `*`, `*\/n`, `a-b`, `a-b/n`,
 * comma lists and plain values. Next-due search is minute-stepped —
 * O(minutes scanned), fine for scheduling horizons of days.
 *
 * @module SnapshotLayer/Engine2
 */

import { SnapshotManager } from '../implementations/SnapshotManager';
import type { StoredSnapshot, TakeOptions } from '../implementations/SnapshotManager';

// ------------------------------------------------------------------ cron

/** A parsed 5-field cron schedule. */
export interface CronSchedule {
  /** Original expression. */
  readonly expr: string;
  /** Set of matching values per field index 0..4. */
  readonly fields: ReadonlyArray<ReadonlySet<number>>;
}

/** Field ranges: [min, max] for minute, hour, dom, month, dow. */
const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

/**
 * Parse a standard 5-field cron expression into per-field value sets.
 *
 * Supported syntax per field:
 *   `*`        every value
 *   `*\/n`      every n-th value starting at the field minimum
 *   `a`        single value
 *   `a,b,c`    list
 *   `a-b`      inclusive range
 *   `a-b/n`    every n-th within the range
 */
export function parseCron(expr: string): CronSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression '${expr}': expected 5 fields, got ${parts.length}`);
  }
  const fields = parts.map((part, i) => parseField(part, FIELD_RANGES[i]![0], FIELD_RANGES[i]![1], expr));
  return { expr, fields };
}

function parseField(field: string, min: number, max: number, expr: string): ReadonlySet<number> {
  const out = new Set<number>();
  for (const item of field.split(',')) {
    const stepMatch = /^(.+)\/(\d+)$/.exec(item);
    const step = stepMatch ? parseInt(stepMatch[2]!, 10) : 1;
    if (step < 1) throw new Error(`Invalid step in '${expr}'`);
    const base = stepMatch ? stepMatch[1]! : item;

    let lo: number;
    let hi: number;
    if (base === '*') {
      lo = min;
      hi = max;
    } else {
      const rangeMatch = /^(\d+)-(\d+)$/.exec(base);
      if (rangeMatch) {
        lo = parseInt(rangeMatch[1]!, 10);
        hi = parseInt(rangeMatch[2]!, 10);
      } else if (/^\d+$/.test(base)) {
        lo = parseInt(base, 10);
        hi = stepMatch ? max : lo; // `5/2` means 5,7,9...
      } else {
        throw new Error(`Invalid cron field '${item}' in '${expr}'`);
      }
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`Cron value out of range [${min},${max}] in '${expr}'`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/**
 * Next instant >= `fromMs` matching the schedule, or undefined if none
 * within `horizonMs` (default 366 days — handles Feb-29-only schedules).
 * Minute-stepped scan; each step is O(1).
 */
export function nextCronRun(schedule: CronSchedule, fromMs: number, horizonMs = 366 * 24 * 3600_000): number | undefined {
  // Start at the next whole minute boundary.
  let t = Math.ceil(fromMs / 60_000) * 60_000;
  const end = fromMs + horizonMs;
  const [minutes, hours, doms, months, dows] = schedule.fields as [
    ReadonlySet<number>,
    ReadonlySet<number>,
    ReadonlySet<number>,
    ReadonlySet<number>,
    ReadonlySet<number>,
  ];
  while (t <= end) {
    const d = new Date(t);
    // Cron dom/dow semantics: when BOTH are restricted (not '*'),
    // a match on EITHER fires (standard cron union semantics).
    const domRestricted = doms.size < 31;
    const dowRestricted = dows.size < 7;
    const domMatch = doms.has(d.getUTCDate());
    const dowMatch = dows.has(d.getUTCDay());
    const dayOk = domRestricted && dowRestricted ? domMatch || dowMatch : domMatch && dowMatch;
    if (
      dayOk &&
      months.has(d.getUTCMonth() + 1) &&
      hours.has(d.getUTCHours()) &&
      minutes.has(d.getUTCMinutes())
    ) {
      return t;
    }
    t += 60_000;
  }
  return undefined;
}

// ------------------------------------------------------------------ retention

/** A retention decision made by the scheduler. */
export interface RetentionDecision {
  readonly snapshotId: string;
  readonly evicted: boolean;
  /** Why the snapshot was kept or why eviction was skipped. */
  readonly reason: string;
}

/**
 * Pluggable retention evaluator — returns the ids to EVICT.
 * The existing `RetentionPolicy` is adapted via `retentionPolicyAdapter`.
 */
export type RetentionEvaluator = (snapshots: readonly StoredSnapshot[], nowMs: number) => string[];

/** Adapt the existing `RetentionPolicy` (which returns a RetentionPlan). */
export function retentionPolicyAdapter(policy: {
  evaluate(
    snapshots: readonly StoredSnapshot[],
    nowMs?: number,
  ): { deleteOrder: string[] };
}): RetentionEvaluator {
  return (snapshots, nowMs) => policy.evaluate(snapshots, nowMs).deleteOrder;
}

// ------------------------------------------------------------------ jobs

/** A named scheduled snapshot job. */
export interface SnapshotJob {
  readonly name: string;
  readonly schedule: CronSchedule;
  readonly take: Omit<TakeOptions, 'labels'> & { labels?: string[] };
  /** Retention evaluator run after each successful take. */
  readonly retention?: RetentionEvaluator;
  /** Next due instant (ms). Advanced after each fire. */
  nextDue: number;
  /** Consecutive failures — backoff hint for callers. */
  failures: number;
}

/** What happened for one job in a tick. */
export interface JobFireResult {
  readonly job: string;
  readonly fired: boolean;
  /** Set by tick() on success. */
  snapshotId?: string;
  /** Set by tick() on failure. */
  error?: string;
  /** Set by tick() when a retention policy runs. */
  retention: RetentionDecision[];
}

export class SnapshotScheduler {
  private readonly _manager: SnapshotManager;
  private readonly _jobs: SnapshotJob[] = [];

  constructor(manager: SnapshotManager) {
    this._manager = manager;
  }

  /** Register a job. Throws on a bad cron expression. */
  addJob(name: string, cronExpr: string, take: SnapshotJob['take'] = {}, retention?: RetentionEvaluator, fromMs = Date.now()): SnapshotJob {
    if (this._jobs.some((j) => j.name === name)) {
      throw new Error(`Job '${name}' already registered`);
    }
    const schedule = parseCron(cronExpr);
    const nextDue = nextCronRun(schedule, fromMs);
    if (nextDue === undefined) {
      throw new Error(`Cron '${cronExpr}' never fires within a year`);
    }
    const job: SnapshotJob = { name, schedule, take, retention, nextDue, failures: 0 };
    this._jobs.push(job);
    return job;
  }

  removeJob(name: string): boolean {
    const i = this._jobs.findIndex((j) => j.name === name);
    if (i < 0) return false;
    this._jobs.splice(i, 1);
    return true;
  }

  get jobs(): readonly SnapshotJob[] {
    return this._jobs;
  }

  /** Next due instant across all jobs (undefined when empty). */
  nextDue(): number | undefined {
    let best: number | undefined;
    for (const j of this._jobs) best = best === undefined ? j.nextDue : Math.min(best, j.nextDue);
    return best;
  }

  /**
   * Evaluate all jobs against `nowMs`, taking any that are due.
   * Each due job fires once, then its next-due is recomputed from the
   * scheduled instant (not from `now`) so a delayed tick does not
   * drift the schedule.
   */
  tick(nowMs: number): JobFireResult[] {
    const results: JobFireResult[] = [];
    for (const job of this._jobs) {
      if (job.nextDue > nowMs) {
        results.push({ job: job.name, fired: false, retention: [] });
        continue;
      }
      const dueAt = job.nextDue;
      let result: JobFireResult;
      try {
        // NOTE: no implicit `job:` label — RetentionPolicy treats labeled
        // snapshots as keep-forever, which would silently disable
        // retention for every scheduled snapshot.
        const snap = this._manager.take(job.take);
        job.failures = 0;
        result = {
          job: job.name,
          fired: true,
          snapshotId: snap.id,
          retention: job.retention ? this._applyRetention(job.retention, nowMs) : [],
        };
      } catch (e) {
        job.failures++;
        result = {
          job: job.name,
          fired: true,
          error: e instanceof Error ? e.message : String(e),
          retention: [],
        };
      }
      // Re-anchor from the scheduled instant to avoid drift.
      job.nextDue = nextCronRun(job.schedule, dueAt + 60_000) ?? nextCronRun(job.schedule, nowMs) ?? nowMs + 86_400_000;
      results.push(result);
    }
    return results;
  }

  /**
   * Run retention for a job against the manager's snapshot list.
   * `evictIds` is expected in leaf→root delete order (as produced by
   * `RetentionPlan.deleteOrder`); before deleting a snapshot whose
   * surviving children are incremental, those children are flattened
   * so the chain stays restorable — same semantics as
   * `RetentionPolicy.apply`.
   */
  private _applyRetention(evaluator: RetentionEvaluator, nowMs: number): RetentionDecision[] {
    const all = this._manager.list();
    const evictOrder = evaluator(all, nowMs);
    const evictSet = new Set(evictOrder);
    const decisions: RetentionDecision[] = [];

    for (const id of evictOrder) {
      // Flatten any surviving incremental child before removing its parent.
      for (const child of this._manager.childrenOf(id)) {
        if (!evictSet.has(child.id)) {
          this._manager.flatten(child.id);
        }
      }
      const ok = this._manager.delete(id);
      decisions.push({ snapshotId: id, evicted: ok, reason: ok ? 'retention policy' : 'already gone' });
    }
    return decisions;
  }
}
