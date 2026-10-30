/**
 * Recovery Runbook Automation
 *
 * Executes a declared runbook — the DR recovery steps turned into
 * checkable code instead of a wiki page nobody can prove works.
 *
 * Execution semantics:
 *   - Steps run in declared order; a step waits until every
 *     `dependsOn` step is `done`.
 *   - A failed `required` step is a checkpoint-halting failure: the
 *     run stops, later steps stay `pending`, and `halted` reports the
 *     blocking step — mirroring a runbook you cannot safely continue.
 *   - A failed non-required step records `failed` and execution
 *     continues (advisory checks, informational gathers).
 *   - Every completed required step writes a checkpoint timestamp —
 *     resumability: a rerun can be reasoned about from checkpoints.
 *   - Steps that can never run (dependency failed/unsatisfiable) are
 *     marked `skipped` at the end — never silently dropped.
 *
 * Steps may communicate through the context's publish/read sidechannel
 * (e.g. promote writes the new endpoint, verify reads it).
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import {
  DrClock2,
  RunbookContext,
  RunbookResult,
  RunbookStep,
  StepOutcome,
  StepStatus,
  SystemDrClock2,
} from './types';

export class RunbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunbookError';
  }
}

export class Runbook {
  private readonly _clock: DrClock2;
  private readonly _steps: readonly RunbookStep[];
  private readonly _log: string[] = [];

  constructor(steps: readonly RunbookStep[], clock: DrClock2 = new SystemDrClock2()) {
    const ids = new Set<string>();
    for (const s of steps) {
      if (ids.has(s.id)) throw new RunbookError(`duplicate step id '${s.id}'`);
      ids.add(s.id);
      for (const dep of s.dependsOn ?? []) {
        if (!steps.some((x) => x.id === dep)) {
          throw new RunbookError(`step '${s.id}' depends on unknown '${dep}'`);
        }
      }
    }
    this._steps = steps;
    this._clock = clock;
  }

  /** The run log lines (operator transcript). */
  get transcript(): readonly string[] {
    return this._log;
  }

  /** Execute the runbook; resolves when halted or complete. */
  async run(): Promise<RunbookResult> {
    const outcomes = new Map<string, StepOutcome>();
    const checkpoints: Array<{ stepId: string; at: number }> = [];
    const published = new Map<string, unknown>();
    const ctx: RunbookContext = {
      log: (m) => this._log.push(m),
      read: <T,>(key: string) => published.get(key) as T | undefined,
      publish: (key, value) => void published.set(key, value),
    };

    let halted = false;
    let failedStep: string | undefined;

    for (const step of this._steps) {
      // A halted runbook leaves every remaining step unreachable —
      // mark skipped so the outcome is explicit, not ambiguous pending.
      if (halted) {
        outcomes.set(step.id, {
          id: step.id,
          status: 'skipped',
          startedAt: this._clock.now(),
          endedAt: this._clock.now(),
          durationMs: 0,
          note: `runbook halted at '${failedStep}'`,
          checkpointed: false,
        });
        continue;
      }
      // Dependency gate: unmet deps make the step unsatisfiable.
      const unmet = (step.dependsOn ?? []).filter(
        (d) => outcomes.get(d)?.status !== 'done'
      );
      if (unmet.length > 0) {
        outcomes.set(step.id, {
          id: step.id,
          status: 'skipped',
          startedAt: this._clock.now(),
          endedAt: this._clock.now(),
          durationMs: 0,
          note: `unmet dependencies: ${unmet.join(', ')}`,
          checkpointed: false,
        });
        if (step.required) {
          halted = true;
          failedStep = step.id;
        }
        continue;
      }

      const startedAt = this._clock.now();
      let status: StepStatus = 'done';
      let note: string | undefined;
      let error: string | undefined;
      try {
        const out = await step.run(ctx);
        if (typeof out === 'string') note = out;
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
      }
      const endedAt = this._clock.now();
      const checkpointed = status === 'done' && step.required;
      if (checkpointed) checkpoints.push({ stepId: step.id, at: endedAt });
      outcomes.set(step.id, {
        id: step.id,
        status,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        note,
        error,
        checkpointed,
      });
      if (status === 'failed' && step.required) {
        halted = true;
        failedStep = step.id;
      }
    }



    return {
      halted,
      failedStep,
      outcomes: this._steps.map((s) => {
        const o = outcomes.get(s.id);
        if (!o) throw new RunbookError(`missing outcome for '${s.id}'`);
        return o;
      }),
      checkpoints,
      completedAt: this._clock.now(),
    };
  }
}
