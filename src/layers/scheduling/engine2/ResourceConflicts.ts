/**
 * Scheduling Engine2 — Resource Conflict Detection
 *
 * Two jobs writing the same table, holding the same lock, or saturating
 * the same worker pool can't overlap in time. The basic scheduler has no
 * resource model; this module adds one:
 *
 *   - Jobs declare `resources` (string ids they exclusively need).
 *   - `conflicts(jobA, jobB)` — static check: do their declared resource
 *     sets intersect? O(min(|A|,|B|)) via the smaller set.
 *   - `overlapping(jobId, startMs, endMs)` — interval check against a
 *     planned run: which registered jobs on shared resources have fire
 *     windows intersecting [start, end)?
 *   - `forecast(horizonMs)` — projects each cron job's next fire times
 *     and reports resource conflicts in the lookahead window — the
 *     "will tonight's 2am batch collide?" report.
 *   - `timeline(jobId)` — next N fire windows for one job.
 *
 * Interval overlap uses the strict half-open convention: [a,b) vs [c,d)
 * overlap iff a < d && c < b — back-to-back runs (end == start) do NOT
 * conflict, matching typical mutex semantics.
 *
 * Complexity: conflicts O(min sets); forecast O(jobs × fires × resources).
 *
 * @module SchedulingLayer/Engine2
 */

import { CronSchedule } from '../scheduler/CronParser';
import { Clock, SystemClock } from '../scheduler/SchedulerTypes';

/** A job registered for resource-conflict tracking. */
export interface ResourceJob {
  readonly jobId: string;
  /** Exclusive resource ids this job needs while running. */
  readonly resources: readonly string[];
  /** Estimated/expected run duration — defines the fire window. */
  readonly estDurationMs: number;
  /** Cron expression for recurring jobs; one-shot uses `nextFireAt`. */
  readonly cron?: string;
  /** Fixed next-fire time for one-shot jobs (mutually exclusive w/ cron). */
  readonly nextFireAt?: number;
}

export interface ResourceConflict {
  readonly jobA: string;
  readonly jobB: string;
  /** Resources both jobs need. */
  readonly shared: readonly string[];
}

export interface WindowConflict extends ResourceConflict {
  /** [start,end) overlap window where both jobs are projected to run. */
  readonly overlapStart: number;
  readonly overlapEnd: number;
}

export interface FireWindow {
  readonly jobId: string;
  readonly start: number;
  readonly end: number;
}

export class ResourceConflictDetector {
  private readonly _clock: Clock;
  private readonly _jobs = new Map<string, ResourceJob & { cronParsed?: CronSchedule }>();
  /** resource → jobIds needing it. */
  private readonly _byResource = new Map<string, Set<string>>();

  constructor(clock?: Clock) {
    this._clock = clock ?? new SystemClock();
  }

  register(job: ResourceJob): void {
    if (job.cron === undefined && job.nextFireAt === undefined) {
      throw new Error(`job '${job.jobId}' needs a cron or nextFireAt`);
    }
    const parsed = job.cron ? new CronSchedule(job.cron) : undefined;
    this.unregister(job.jobId);
    this._jobs.set(job.jobId, { ...job, cronParsed: parsed });
    for (const r of job.resources) {
      let set = this._byResource.get(r);
      if (!set) {
        set = new Set();
        this._byResource.set(r, set);
      }
      set.add(job.jobId);
    }
  }

  unregister(jobId: string): boolean {
    const j = this._jobs.get(jobId);
    if (!j) return false;
    for (const r of j.resources) this._byResource.get(r)?.delete(jobId);
    return this._jobs.delete(jobId);
  }

  /** Static set-intersection — do these two jobs share any resource? */
  conflicts(jobA: string, jobB: string): ResourceConflict | null {
    const a = this._jobs.get(jobA);
    const b = this._jobs.get(jobB);
    if (!a || !b) return null;
    const [small, big] = a.resources.length <= b.resources.length ? [a, b] : [b, a];
    const bigSet = new Set(big.resources);
    const shared = small.resources.filter((r) => bigSet.has(r));
    return shared.length === 0
      ? null
      : { jobA, jobB, shared };
  }

  /** Every pair sharing ≥1 resource — the conflict graph edge list. */
  allConflicts(): ResourceConflict[] {
    const seen = new Set<string>();
    const out: ResourceConflict[] = [];
    const ids = [...this._jobs.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const c = this.conflicts(ids[i], ids[j]);
        if (c) out.push(c);
      }
    }
    return out;
  }

  /** Next `n` fire windows for one job from `from` (default now). */
  timeline(jobId: string, n: number, from?: number): FireWindow[] {
    const j = this._jobs.get(jobId);
    if (!j) throw new Error(`unknown job '${jobId}'`);
    const start = from ?? this._clock.now();
    const out: FireWindow[] = [];
    if (j.cronParsed) {
      let t = start;
      for (let i = 0; i < n; i++) {
        const fire = j.cronParsed.nextAfter(t);
        if (fire === null) break;
        out.push({ jobId, start: fire, end: fire + j.estDurationMs });
        t = fire;
      }
    } else if (j.nextFireAt !== undefined && j.nextFireAt >= start) {
      out.push({ jobId, start: j.nextFireAt, end: j.nextFireAt + j.estDurationMs });
    }
    return out;
  }

  /**
   * Project all jobs' fire windows over (now, now+horizonMs] and report
   * every overlapping pair on a shared resource. Lookahead bounded at
   * `maxFiresPerJob` windows per job (default 32) so dense crons can't
   * explode the projection.
   */
  forecast(horizonMs: number, maxFiresPerJob = 32): WindowConflict[] {
    const now = this._clock.now();
    const horizonEnd = now + horizonMs;
    // Job → projected windows within the horizon.
    const windows = new Map<string, FireWindow[]>();
    for (const [id] of this._jobs) {
      const ws: FireWindow[] = [];
      if (this._jobs.get(id)!.cronParsed) {
        let t = now;
        for (let i = 0; i < maxFiresPerJob; i++) {
          const fire = this._jobs.get(id)!.cronParsed!.nextAfter(t);
          if (fire === null || fire > horizonEnd) break;
          ws.push({ jobId: id, start: fire, end: fire + this._jobs.get(id)!.estDurationMs });
          t = fire;
        }
      } else {
        const j = this._jobs.get(id)!;
        if (j.nextFireAt !== undefined && j.nextFireAt <= horizonEnd && j.nextFireAt >= now) {
          ws.push({ jobId: id, start: j.nextFireAt, end: j.nextFireAt + j.estDurationMs });
        }
      }
      if (ws.length > 0) windows.set(id, ws);
    }

    const out: WindowConflict[] = [];
    for (const c of this.allConflicts()) {
      const a = windows.get(c.jobA) ?? [];
      const b = windows.get(c.jobB) ?? [];
      for (const wa of a) {
        for (const wb of b) {
          const start = Math.max(wa.start, wb.start);
          const end = Math.min(wa.end, wb.end);
          if (start < end) {
            out.push({ ...c, overlapStart: start, overlapEnd: end });
          }
        }
      }
    }
    return out.sort((x, y) => x.overlapStart - y.overlapStart);
  }
}
