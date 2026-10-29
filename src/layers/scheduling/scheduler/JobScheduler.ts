/**
 * Job Scheduler
 *
 * The engine: registers jobs (cron recurring or one-shot), maintains a
 * min-heap of due fire times, dispatches through {@link JobExecutor} with
 * per-job concurrency limits, enforces dependency ordering, and applies
 * missed-run policy when slots were skipped.
 *
 * The scheduler is pull-based: `tick()` examines the heap, runs everything
 * due, and reschedules recurring jobs. No timers — the host calls `tick`
 * on whatever cadence it likes (tests drive it with a fake clock).
 *
 * Dependency model: a job with `dependsOn` may only run when all its
 * dependencies' last executions succeeded; cyclic dependencies are
 * rejected at registration.
 *
 * @module SchedulingLayer/Scheduler
 */

import {
  Clock,
  ExecutionRecord,
  JobDefinition,
  ScheduledJob,
  SchedulerError,
  SystemClock,
} from './SchedulerTypes';
import { CronSchedule } from './CronParser';
import { JobExecutor } from './JobExecutor';
import { JobQueue } from './MinHeap';

export class JobScheduler {
  private readonly _jobs = new Map<string, ScheduledJob>();
  private readonly _crons = new Map<string, CronSchedule>();
  private readonly _queue = new JobQueue();
  readonly executor: JobExecutor;

  constructor(private readonly _clock: Clock = new SystemClock()) {
    this.executor = new JobExecutor(_clock);
  }

  // ------------------------------------------------------------ registration

  /**
   * Register a job. Throws on duplicate id, unknown dependency, or a
   * dependency cycle.
   */
  register(def: JobDefinition): void {
    if (this._jobs.has(def.jobId)) {
      throw new SchedulerError('DUPLICATE_JOB', `job '${def.jobId}' already registered`);
    }
    this._validate(def);
    const job: ScheduledJob = {
      def,
      nextFireAt: this._firstFire(def),
      running: 0,
      missedSlots: [],
      executions: 0,
      lastStatus: null,
      lastDispatchAt: this._clock.now(),
      enabled: true,
    };
    this._jobs.set(def.jobId, job);
    if (job.nextFireAt !== null) {
      this._queue.push(def.jobId, job.nextFireAt, def.priority ?? 0);
    }
  }

  unregister(jobId: string): boolean {
    const existed = this._jobs.delete(jobId);
    if (existed) {
      this._crons.delete(jobId);
      this._queue.removeJob(jobId);
    }
    return existed;
  }

  enable(jobId: string): void {
    const j = this._get(jobId);
    j.enabled = true;
  }

  disable(jobId: string): void {
    const j = this._get(jobId);
    j.enabled = false;
  }

  job(jobId: string): ScheduledJob | null {
    return this._jobs.get(jobId) ?? null;
  }

  /** Next time the queue will fire — for host-side sleep-until logic. */
  nextDueAt(): number | null {
    return this._queue.peek()?.fireAt ?? null;
  }

  // ------------------------------------------------------------ tick

  /**
   * Dispatch every job due at or before `now`. Returns the execution
   * records started (jobs with retries produce multiple internal attempts
   * but only the final record is returned).
   */
  async tick(now?: number): Promise<readonly ExecutionRecord[]> {
    const t = now ?? this._clock.now();
    const due = this._queue.popDue(t);
    const done: ExecutionRecord[] = [];

    for (const entry of due) {
      const job = this._jobs.get(entry.jobId);
      if (!job || !job.enabled) {
        if (job) this._reschedule(job, t);
        continue;
      }
      // Dependency gate: all deps must have a successful last execution.
      if (!this._depsSatisfied(job)) {
        // Defer — push back with a short delay rather than dropping.
        this._queue.push(job.def.jobId, t + 1000, job.def.priority ?? 0);
        continue;
      }
      // Concurrency gate: over the limit → the fire time is "missed" and
      // handled per missedRunPolicy.
      const maxConcurrent = job.def.concurrency ?? 1;
      if (job.running >= maxConcurrent) {
        job.missedSlots.push(entry.fireAt);
        this._reschedule(job, t);
        continue;
      }
      // Backfill slots missed since the last dispatch (downtime or blocked
      // concurrency). The queue only carries the NEXT fire time, so a gap
      // surfaces as one entry — the cron tells us the rest.
      const missed = this._missedSlots(job, entry.fireAt, t);
      job.missedSlots = [];
      // Always run the due slot itself first, then any backfill slots.
      const slots = [entry.fireAt, ...missed];
      for (const s of slots) {
        const rec = await this._launch(job, s);
        done.push(rec);
      }
      this._reschedule(job, t);
    }
    return done;
  }

  /**
   * Manually trigger a job right now, bypassing the queue but not the
   * concurrency/dependency gates.
   */
  async trigger(jobId: string): Promise<ExecutionRecord | null> {
    const job = this._get(jobId);
    if (!this._depsSatisfied(job)) return null;
    const maxConcurrent = job.def.concurrency ?? 1;
    if (job.running >= maxConcurrent) return null;
    return this._launch(job, this._clock.now());
  }

  /**
   * Fire times in (from, to] per the job's cron — used to backfill missed
   * slots after scheduler downtime (the queue only holds the next slot,
   * so a 3h gap shows up as one due entry; the missed ones live between
   * the last run and now).
   */
  missedSince(jobId: string, from: number, to: number): readonly number[] {
    const cron = this._crons.get(jobId);
    if (!cron) return [];
    return cron.between(from, to);
  }

  private async _launch(job: ScheduledJob, scheduledAt: number): Promise<ExecutionRecord> {
    job.running++;
    job.executions++;
    const rec = await this.executor.run(job.def, scheduledAt);
    job.running--;
    job.lastStatus = rec.status === 'running' ? 'failure' : rec.status;
    return rec;
  }

  // ------------------------------------------------------------ scheduling internals

  private _reschedule(job: ScheduledJob, now: number): void {
    const next = this._computeNext(job, now);
    job.nextFireAt = next;
    if (next !== null) {
      this._queue.push(job.def.jobId, next, job.def.priority ?? 0);
    }
  }

  private _computeNext(job: ScheduledJob, after: number): number | null {
    if (job.def.schedule.kind === 'once') {
      // One-shot: only fires again if it hasn't run yet.
      return job.executions === 0 && job.running === 0 ? job.def.schedule.at : null;
    }
    const cron = this._crons.get(job.def.jobId)!;
    return cron.nextAfter(after);
  }

  private _firstFire(def: JobDefinition): number | null {
    if (def.schedule.kind === 'once') return def.schedule.at;
    const cron = new CronSchedule(def.schedule.expr);
    this._crons.set(def.jobId, cron);
    return cron.nextAfter(this._clock.now());
  }

  /**
   * Slots to backfill, per the job's missedRunPolicy:
   *   skip-all → [] (run once for the current slot)
   *   skip-one → the latest missed slot
   *   run-all  → every missed slot since the last dispatch
   *
   * Missed slots = cron fire times in (lastDispatch, now] minus the one
   * about to run. `job.lastDispatchAt` tracks when the job last ran.
   */
  private _missedSlots(job: ScheduledJob, dueFireAt: number, now: number): number[] {
    const policy = job.def.missedRunPolicy ?? 'skip-all';
    // Slots blocked by concurrency (queued while running) + slots the
    // scheduler slept through.
    const blocked = job.missedSlots;
    let slept: readonly number[] = [];
    const cron = this._crons.get(job.def.jobId);
    // Slots slept through while the scheduler was down: every fire time
    // in (dueFireAt, now] that elapsed before we could dispatch it.
    if (cron) {
      slept = cron.between(dueFireAt, now);
    }
    const all = [...blocked, ...slept].sort((a, b) => a - b);
    job.lastDispatchAt = now;
    if (all.length === 0) return [];
    switch (policy) {
      case 'skip-all': return [];
      case 'skip-one': return [all[all.length - 1]];
      case 'run-all': return all;
    }
  }

  private _depsSatisfied(job: ScheduledJob): boolean {
    const deps = job.def.dependsOn ?? [];
    for (const depId of deps) {
      const dep = this._jobs.get(depId);
      if (!dep || dep.lastStatus !== 'success') return false;
    }
    return true;
  }

  private _validate(def: JobDefinition): void {
    if (!def.jobId) throw new SchedulerError('INVALID_JOB', 'jobId required');
    if (def.schedule.kind === 'cron') {
      new CronSchedule(def.schedule.expr); // throws on invalid
    }
    for (const dep of def.dependsOn ?? []) {
      if (!this._jobs.has(dep)) {
        throw new SchedulerError('DEP_NOT_FOUND', `job '${def.jobId}' depends on unknown '${dep}'`);
      }
    }
    // Cycle check via DFS from def through registered jobs.
    if (def.dependsOn && this._createsCycle(def.jobId, def.dependsOn)) {
      throw new SchedulerError('CYCLE', `job '${def.jobId}' creates a dependency cycle`);
    }
  }

  /**
   * Would adding `jobId → dependsOn` create a cycle? Walk the dep graph
   * from each dependency; reaching `jobId` (as an already-registered job
   * that transitively depends on it) means a cycle.
   */
  private _createsCycle(jobId: string, deps: readonly string[]): boolean {
    const seen = new Set<string>();
    const stack = [...deps];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === jobId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const j = this._jobs.get(id);
      if (j?.def.dependsOn) stack.push(...j.def.dependsOn);
    }
    return false;
  }

  private _get(jobId: string): ScheduledJob {
    const j = this._jobs.get(jobId);
    if (!j) throw new SchedulerError('JOB_NOT_FOUND', `no job '${jobId}'`);
    return j;
  }
}
