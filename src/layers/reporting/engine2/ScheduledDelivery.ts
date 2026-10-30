/**
 * Reporting Engine2 — Scheduled Delivery
 *
 * ReportEngine's `runDue` executes a cron schedule and returns results;
 * what it does NOT do is get the report anywhere. Engine2 closes the
 * loop: a schedule is bound to named delivery channels, and `runDue`
 * generates then fans the artifact out to each channel.
 *
 * Model:
 *   - Channels are named functions (email, webhook, s3-drop…) injected by
 *     the host — the layer stays I/O-free and testable.
 *   - `runDue(now)` walks schedules whose next cron tick elapsed, invokes
 *     the caller-supplied generator once per schedule (generate ONCE,
 *     deliver MANY), then delivers per-channel with isolated failure —
 *     one broken webhook doesn't starve the others.
 *   - Each delivery attempt is recorded in a bounded history for the
 *     "did finance get Monday's report?" audit question.
 *   - Backoff: a schedule whose GENERATION throws records the failure and
 *     is retried at its next cron tick — no tight retry loop against a
 *     wedged dataset.
 *
 * Complexity: O(schedules) per runDue; delivery O(channels) per due job.
 *
 * @module ReportingLayer/Engine2
 */

import { CronExpression } from '../reports/CronSchedule';
import { Clock, ReportResult, SystemClock } from '../reports/ReportTypes';

/** One finished artifact handed to channels. */
export interface GeneratedReport {
  readonly scheduleId: string;
  readonly generatedAt: number;
  readonly format: string;
  readonly content: string;
  readonly rowCount: number;
}

/** A named delivery target. Throw to mark that channel failed. */
export type DeliveryChannel = (report: GeneratedReport) => Promise<void> | void;

export interface ScheduledJob {
  readonly scheduleId: string;
  /** 5-field cron expression. */
  readonly cron: string;
  readonly format: string;
  /** Channel names; must be registered before first delivery. */
  readonly channels: readonly string[];
  enabled: boolean;
}

export type DeliveryStatus = 'delivered' | 'generation-failed' | 'delivery-failed';

export interface DeliveryRecord {
  readonly scheduleId: string;
  readonly channel: string | null; // null when generation itself failed
  readonly dueAt: number;
  readonly attemptedAt: number;
  readonly status: DeliveryStatus;
  readonly error?: string;
}

export interface ScheduledDeliveryOptions {
  readonly clock?: Clock;
  /** Delivery history retained per schedule (ring). Default 100. */
  readonly historyPerSchedule?: number;
}

interface JobState {
  readonly job: ScheduledJob;
  readonly cron: CronExpression;
  nextFireAt: number | null;
}

export class ScheduledDelivery {
  private readonly _clock: Clock;
  private readonly _channels = new Map<string, DeliveryChannel>();
  private readonly _jobs = new Map<string, JobState>();
  private readonly _historyCap: number;
  private _history: DeliveryRecord[] = [];

  constructor(options?: ScheduledDeliveryOptions) {
    this._clock = options?.clock ?? new SystemClock();
    this._historyCap = options?.historyPerSchedule ?? 100;
  }

  registerChannel(name: string, channel: DeliveryChannel): void {
    this._channels.set(name, channel);
  }

  schedule(job: ScheduledJob): void {
    const cron = new CronExpression(job.cron);
    const now = this._clock.now();
    this._jobs.set(job.scheduleId, {
      job,
      cron,
      nextFireAt: job.enabled === false ? null : cron.next(now),
    });
  }

  unschedule(scheduleId: string): boolean {
    return this._jobs.delete(scheduleId);
  }

  setEnabled(scheduleId: string, enabled: boolean): void {
    const j = this._jobs.get(scheduleId);
    if (!j) return;
    j.job.enabled = enabled;
    j.nextFireAt = enabled ? j.cron.next(this._clock.now()) : null;
  }

  /** Next due fire time for a schedule, or null when disabled/unknown. */
  nextDueAt(scheduleId: string): number | null {
    return this._jobs.get(scheduleId)?.nextFireAt ?? null;
  }

  /**
   * Run every schedule due as of `now` (defaults to clock.now()).
   * `generate` produces the artifact once; each channel gets a copy.
   * Returns the records appended this tick.
   */
  async runDue(
    generate: (scheduleId: string) => Promise<GeneratedReport> | GeneratedReport,
    now = this._clock.now()
  ): Promise<DeliveryRecord[]> {
    const fresh: DeliveryRecord[] = [];

    for (const state of this._jobs.values()) {
      if (!state.job.enabled || state.nextFireAt === null) continue;
      while (state.nextFireAt !== null && state.nextFireAt <= now) {
        const dueAt = state.nextFireAt;
        state.nextFireAt = state.cron.next(dueAt); // advance before running
        fresh.push(...(await this._run(state, generate, dueAt)));
      }
    }
    return fresh;
  }

  private async _run(
    state: JobState,
    generate: (scheduleId: string) => Promise<GeneratedReport> | GeneratedReport,
    dueAt: number
  ): Promise<DeliveryRecord[]> {
    const records: DeliveryRecord[] = [];
    const attemptedAt = this._clock.now();

    let artifact: GeneratedReport;
    try {
      artifact = await generate(state.job.scheduleId);
    } catch (e) {
      const rec: DeliveryRecord = {
        scheduleId: state.job.scheduleId,
        channel: null,
        dueAt,
        attemptedAt,
        status: 'generation-failed',
        error: e instanceof Error ? e.message : String(e),
      };
      records.push(rec);
      this._append(rec);
      return records;
    }

    for (const name of state.job.channels) {
      const channel = this._channels.get(name);
      let rec: DeliveryRecord;
      if (!channel) {
        rec = {
          scheduleId: state.job.scheduleId,
          channel: name,
          dueAt,
          attemptedAt,
          status: 'delivery-failed',
          error: `unknown channel '${name}'`,
        };
      } else {
        try {
          await channel(artifact);
          rec = {
            scheduleId: state.job.scheduleId,
            channel: name,
            dueAt,
            attemptedAt: this._clock.now(),
            status: 'delivered',
          };
        } catch (e) {
          rec = {
            scheduleId: state.job.scheduleId,
            channel: name,
            dueAt,
            attemptedAt: this._clock.now(),
            status: 'delivery-failed',
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      records.push(rec);
      this._append(rec);
    }
    return records;
  }

  private _append(rec: DeliveryRecord): void {
    this._history.push(rec);
    // Global bound is per-schedule cap × job count (min cap); simple ring.
    const cap = this._historyCap * Math.max(1, this._jobs.size);
    if (this._history.length > cap) {
      this._history = this._history.slice(this._history.length - cap);
    }
  }

  history(scheduleId?: string): readonly DeliveryRecord[] {
    return scheduleId === undefined
      ? this._history
      : this._history.filter((r) => r.scheduleId === scheduleId);
  }
}

/** Adapter: wrap a ReportResult + exporter into the generator signature. */
export function makeArtifact(
  scheduleId: string,
  format: string,
  content: string,
  result: ReportResult
): GeneratedReport {
  return {
    scheduleId,
    generatedAt: result.generatedAt,
    format,
    content,
    rowCount: result.rows.length,
  };
}
