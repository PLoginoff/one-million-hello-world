/**
 * Smoke Test Runner
 *
 * The post-deploy validation suite: a declared sequence of checks run
 * against the green stack after a switch (or before declaring it live).
 * Each check reports pass/fail, duration and detail; a failing
 * `required` check aborts the suite — there is no point running
 * "end-to-end checkout" once "the pod is up" already failed.
 *
 * Timeouts are enforced against the *injected* clock: a check that
 * resolves after its `timeoutMs` is marked timed-out (the promise
 * itself cannot be preempted in cooperative JS — callers using real
 * async work should also time-bound inside `run()`; what the runner
 * guarantees is honest reporting, not preemption).
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { BgClock2, SmokeReport, SmokeResult, SmokeTest, SystemBgClock2 } from './types';

export class SmokeRunner {
  private readonly _clock: BgClock2;
  private readonly _tests: readonly SmokeTest[];

  constructor(tests: readonly SmokeTest[], clock: BgClock2 = new SystemBgClock2()) {
    const names = new Set<string>();
    for (const t of tests) {
      if (names.has(t.name)) throw new Error(`duplicate smoke test '${t.name}'`);
      names.add(t.name);
    }
    this._tests = tests;
    this._clock = clock;
  }

  /** Run the suite in declared order; resolves when done or aborted. */
  async run(): Promise<SmokeReport> {
    const results: SmokeResult[] = [];
    let aborted = false;
    for (const t of this._tests) {
      const start = this._clock.now();
      let ok = true;
      let detail: string | undefined;
      let error: string | undefined;
      try {
        const out = await t.run();
        if (out === false) ok = false;
        if (typeof out === 'string') detail = out;
        // void return ⇒ success unless it threw
      } catch (err) {
        ok = false;
        error = err instanceof Error ? err.message : String(err);
      }
      const end = this._clock.now();
      const durationMs = end - start;
      const timedOut =
        t.timeoutMs !== undefined && durationMs > t.timeoutMs;
      if (timedOut) ok = false;
      results.push({
        name: t.name,
        ok,
        durationMs,
        detail,
        error: timedOut && !error ? `exceeded timeout ${t.timeoutMs}ms` : error,
        timedOut,
      });
      if (!ok && (t.required ?? true)) {
        aborted = true;
        break;
      }
    }
    return {
      ok: !aborted && results.every((r) => r.ok),
      results,
      aborted,
    };
  }
}
