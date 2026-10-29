/**
 * Blue-Green Deploy — Request Drainer
 *
 * Waits for an environment's in-flight request count to reach zero before the
 * slot is retired. The orchestrator calls `drain()` after shifting traffic
 * away; in-flight counts are driven by `EnvironmentManager.requestStarted /
 * requestFinished` hooks that the request path calls.
 *
 * The drainer polls on an injectable sleeper (bounded `timeoutMs`), then
 * force-completes: stuck connections are dropped when the deadline passes —
 * better to sever stragglers than wedge a release forever. A force-drain is
 * recorded on the returned result.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, EnvColor } from './BlueGreenTypes';
import { EnvironmentManager } from './EnvironmentManager';

export interface DrainResult {
  readonly color: EnvColor;
  readonly drained: boolean;
  /** True when the deadline hit and remaining requests were force-closed. */
  readonly forced: boolean;
  readonly remainingInFlight: number;
  readonly waitedMs: number;
}

export class RequestDrainer {
  private readonly _envs: EnvironmentManager;
  private readonly _clock: BgClock;
  private readonly _sleeper: (ms: number) => Promise<void>;
  private readonly _pollMs: number;

  constructor(
    envs: EnvironmentManager,
    clock: BgClock = Date.now,
    sleeper: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    pollMs = 50
  ) {
    this._envs = envs;
    this._clock = clock;
    this._sleeper = sleeper;
    this._pollMs = pollMs;
  }

  /**
   * Wait until `color`'s in-flight count reaches zero or `timeoutMs` passes.
   * On timeout the remaining count is force-closed (zeroed) and reported.
   */
  async drain(color: EnvColor, timeoutMs: number): Promise<DrainResult> {
    const started = this._clock();
    for (;;) {
      if (this._envs.isDrained(color)) {
        return {
          color,
          drained: true,
          forced: false,
          remainingInFlight: 0,
          waitedMs: this._clock() - started,
        };
      }
      if (this._clock() - started >= timeoutMs) {
        const remaining = this._envs.envMut(color).inFlight;
        this._envs.envMut(color).inFlight = 0; // force-close stragglers
        return {
          color,
          drained: true,
          forced: true,
          remainingInFlight: remaining,
          waitedMs: this._clock() - started,
        };
      }
      await this._sleeper(this._pollMs);
    }
  }
}
