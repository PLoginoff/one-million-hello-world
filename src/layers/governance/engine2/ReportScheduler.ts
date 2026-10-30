/**
 * Audit Report Scheduler
 *
 * Cron-style scheduler for recurring compliance reports. Each job
 * carries a generator callback plus an interval; {@link tick} runs any
 * job whose `nextRunAt` has arrived and reschedules it — the standard
 * "every N ms" cadence most compliance teams actually need
 * (daily SOC2 summary, weekly access-review digest, etc.).
 *
 * Jobs that fall behind schedule catch up ONE run per tick — a long
 * downtime produces one overdue report, not a storm of catch-ups
 * (prevents report-flooding after an outage, matching how real cron
 * implementations coalesce missed firings).
 *
 * Reports are retained per job in insertion order, newest last;
 * `reports(jobId)` returns them all, `latest(jobId)` the newest.
 *
 * @module GovernanceLayer/Engine2
 */

import { AuditReport, IClock, ReportJob, SystemClock } from './types';

export type ReportGenerator = () => string | Promise<string>;

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `job-${jobSeq.toString(36)}`;
}

export class ReportScheduler {
  private readonly _jobs: Map<string, ReportJob>;
  private readonly _generators: Map<string, ReportGenerator>;
  private readonly _reports: Map<string, AuditReport[]>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._jobs = new Map();
    this._generators = new Map();
    this._reports = new Map();
    this._clock = clock;
  }

  /**
   * Register a recurring job.
   * @param intervalMs  run cadence
   * @param startAt     first run time; defaults to now + intervalMs
   */
  schedule(name: string, intervalMs: number, generator: ReportGenerator, startAt?: number): ReportJob {
    const job: ReportJob = {
      id: nextJobId(),
      name,
      intervalMs,
      nextRunAt: startAt ?? this._clock.now() + intervalMs,
      lastRunAt: null,
    };
    this._jobs.set(job.id, job);
    this._generators.set(job.id, generator);
    this._reports.set(job.id, []);
    return job;
  }

  /** Remove a job and its reports. */
  unschedule(jobId: string): boolean {
    this._generators.delete(jobId);
    this._reports.delete(jobId);
    return this._jobs.delete(jobId);
  }

  /**
   * Run all due jobs, once each. Returns the reports produced this tick.
   * A job whose `nextRunAt` is far in the past still runs once and is
   * rescheduled from NOW (not from its missed deadline) — coalescing
   * missed firings.
   */
  async tick(): Promise<AuditReport[]> {
    const now = this._clock.now();
    const out: AuditReport[] = [];
    for (const job of this._jobs.values()) {
      if (job.nextRunAt > now) continue;
      const gen = this._generators.get(job.id)!;
      const payload = await gen();
      const report: AuditReport = { jobId: job.id, generatedAt: now, payload };
      this._reports.get(job.id)!.push(report);
      job.lastRunAt = now;
      job.nextRunAt = now + job.intervalMs;
      out.push(report);
    }
    return out;
  }

  /** All reports ever produced by a job, oldest first. */
  reports(jobId: string): AuditReport[] {
    return [...(this._reports.get(jobId) ?? [])];
  }

  /** Most recent report for a job, if any. */
  latest(jobId: string): AuditReport | null {
    const list = this._reports.get(jobId);
    return list && list.length > 0 ? list[list.length - 1]! : null;
  }

  /** Jobs that will run within `withinMs` — the "upcoming runs" view. */
  upcoming(withinMs: number): ReportJob[] {
    const horizon = this._clock.now() + withinMs;
    return Array.from(this._jobs.values()).filter((j) => j.nextRunAt <= horizon);
  }

  job(id: string): ReportJob | null {
    return this._jobs.get(id) ?? null;
  }

  /** All registered jobs. */
  jobs(): ReportJob[] {
    return Array.from(this._jobs.values());
  }
}
