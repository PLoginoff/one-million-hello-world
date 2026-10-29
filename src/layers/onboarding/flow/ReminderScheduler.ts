/**
 * Reminder Scheduler
 *
 * Detects abandoned runs (in-progress but idle beyond a threshold) and
 * schedules re-engagement reminders on a configurable cadence.
 *
 * A run qualifies for a reminder when:
 *   state === 'in-progress'  AND
 *   now - lastActiveAt >= idleMs  AND
 *   no unsent reminder already scheduled at the same cadence step
 *
 * Cadence: [24h, 72h, 168h] by default — a classic 3-touch win-back.
 * Each reminder is keyed (runId, cadenceIndex) so repeats don't double up.
 *
 * @module OnboardingLayer/Flow
 */

import { Clock, FlowRun, Reminder, SystemClock } from './FlowTypes';

export interface ReminderCadence {
  /** Idle time after which this touch fires (ms since lastActiveAt). */
  readonly idleMs: number;
}

export const DEFAULT_CADENCE: readonly ReminderCadence[] = [
  { idleMs: 24 * 3600_000 },
  { idleMs: 72 * 3600_000 },
  { idleMs: 168 * 3600_000 },
];

export class ReminderScheduler {
  private readonly _reminders = new Map<string, Reminder>(); // "runId#idx" → reminder
  private _sentLog: Reminder[] = [];

  constructor(
    private readonly _cadence: readonly ReminderCadence[] = DEFAULT_CADENCE,
    private readonly _clock: Clock = new SystemClock()
  ) {}

  /**
   * Scan runs and schedule reminders for any that hit a cadence step.
   * Returns the newly scheduled reminders.
   */
  schedule(runs: readonly FlowRun[]): readonly Reminder[] {
    const now = this._clock.now();
    const fresh: Reminder[] = [];
    for (const run of runs) {
      if (run.state !== 'in-progress') continue;
      const idle = now - run.lastActiveAt;
      // Find the earliest cadence step that's due but not yet scheduled.
      for (let i = 0; i < this._cadence.length; i++) {
        const key = `${run.runId}#${i}`;
        const existing = this._reminders.get(key);
        if (existing) {
          if (!existing.sent) break; // pending reminder — wait for it
          continue; // sent — advance to next cadence step
        }
        if (idle >= this._cadence[i].idleMs) {
          const r: Reminder = {
            runId: run.runId,
            userId: run.userId,
            flowId: run.flowId,
            sendAt: now, // due immediately once scheduled
            sent: false,
          };
          this._reminders.set(key, r);
          fresh.push(r);
          break; // one reminder per scan per run
        }
        // Not yet due for step i — later steps need more idle time, stop.
        break;
      }
    }
    return fresh;
  }

  /**
   * All unsent reminders due at or before `now`.
   */
  due(now?: number): readonly Reminder[] {
    const t = now ?? this._clock.now();
    return Array.from(this._reminders.values()).filter((r) => !r.sent && r.sendAt <= t);
  }

  /**
   * Dispatch due reminders through `send`. Marks them sent and moves them
   * to the sent log.
   */
  async dispatch(send: (r: Reminder) => Promise<void>): Promise<number> {
    const list = this.due();
    let n = 0;
    for (const r of list) {
      await send(r);
      r.sent = true;
      this._sentLog.push(r);
      n++;
    }
    return n;
  }

  /** Cancel reminders for a run that resumed activity or completed. */
  cancelFor(runId: string): number {
    let n = 0;
    for (const [key, r] of this._reminders) {
      if (r.runId === runId && !r.sent) {
        this._reminders.delete(key);
        n++;
      }
    }
    return n;
  }

  /** Reminder history for tests/audits. */
  get sentLog(): readonly Reminder[] {
    return this._sentLog;
  }
}
