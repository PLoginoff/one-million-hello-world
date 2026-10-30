/**
 * Secrets Rotation — Fleet Orchestrator
 *
 * Coordinates rotation across a set of secrets respecting the
 * {@link RotationDependencyGraph}:
 *
 *   rotate(targets)
 *     └─ for each wave in graph.waves(targets):        // waves run in order
 *          for each secret in wave:                    // secrets in a wave
 *              run ZeroDowntimeRotator to DONE          // run in parallel
 *     on failure → PartialRotationRecovery decides:
 *        dependents of the failed secret are SKIPPED (they'd derive from
 *        material that never landed), already-rotated ancestors stay
 *        rotated (they're valid on their own), and the failed secret's
 *        rotator rolls back its partial work.
 *
 * Recovery policy is explicit: `onFailure: 'abort-fleet' | 'continue-others'`.
 * 'abort-fleet' stops at the first failed wave; 'continue-others' completes
 * waves that don't transitively depend on the failure.
 *
 * A per-secret {@link KeyRing} registry owns key material; the orchestrator
 * never generates material itself — callers inject {@link KeyMaterialFactory}s.
 *
 * @module SecretsRotation/Engine2
 */

import { KeyRing } from '../rotation/KeyRing';
import { KeyMaterial, RotationClock, RotationPolicy } from '../rotation/RotationTypes';
import { RotationDependencyGraph } from './RotationDependencyGraph';
import { ZeroDowntimeRotator, RotationStage, KeyMaterialFactory } from './ZeroDowntimeRotator';
import { SecretUsageTracker } from './SecretUsageTracker';

export type FleetFailurePolicy = 'abort-fleet' | 'continue-others';

export interface SecretRotationResult {
  readonly secretId: string;
  readonly status: 'completed' | 'failed' | 'skipped' | 'rolled-back';
  readonly newGeneration?: number;
  readonly error?: string;
  /** Set when the secret was skipped due to a failed dependency. */
  readonly blockedBy?: string;
}

export interface FleetRotationReport {
  readonly startedAt: number;
  readonly completedAt: number;
  readonly results: ReadonlyArray<SecretRotationResult>;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
}

interface SecretRuntime {
  ring: KeyRing;
  policy: RotationPolicy;
  factory: KeyMaterialFactory;
}

export class FleetRotationOrchestrator {
  readonly graph: RotationDependencyGraph;
  readonly tracker: SecretUsageTracker;
  private readonly _clock: RotationClock;
  private readonly _secrets = new Map<string, SecretRuntime>();
  private readonly _onFailure: FleetFailurePolicy;
  /** ms of simulated time between waves — lets dependent consumers observe. */
  private readonly _waveDelayMs: number;
  /**
   * Advances the caller's (usually manual) clock while a rotator waits on
   * a timed stage. Optional — with the real `Date.now` clock, waiting
   * stages resolve via real time; in tests, pass `(ms) => clock.advance(ms)`.
   */
  private readonly _advance: (ms: number) => void;

  constructor(options: {
    clock?: RotationClock;
    advanceClock?: (ms: number) => void;
    graph?: RotationDependencyGraph;
    tracker?: SecretUsageTracker;
    onFailure?: FleetFailurePolicy;
    waveDelayMs?: number;
  } = {}) {
    this._clock = options.clock ?? Date.now;
    this._advance = options.advanceClock ?? (() => undefined);
    this.graph = options.graph ?? new RotationDependencyGraph();
    this.tracker = options.tracker ?? new SecretUsageTracker({ clock: this._clock });
    this._onFailure = options.onFailure ?? 'abort-fleet';
    this._waveDelayMs = options.waveDelayMs ?? 0;
  }

  /** Register a rotatable secret (ring + policy + material factory). */
  register(secretId: string, policy: RotationPolicy, factory: KeyMaterialFactory, ring?: KeyRing): void {
    this._secrets.set(secretId, {
      ring: ring ?? new KeyRing(secretId, this._clock),
      policy,
      factory,
    });
    this.graph.addSecret(secretId);
  }

  ringOf(secretId: string): KeyRing | undefined {
    return this._secrets.get(secretId)?.ring;
  }

  /**
   * Rotate `targets` in dependency order. Each ZeroDowntimeRotator is
   * driven to completion by pumping `tick()` while advancing the injected
   * clock — deterministic with a manual clock in tests.
   *
   * `advanceMs` = how much simulated time each tick consumes (default:
   * jumps straight to the next interesting boundary by stepping graceMs+1
   * per wait — deterministic and fast).
   */
  async rotate(targets: ReadonlyArray<string>, advanceMs?: number): Promise<FleetRotationReport> {
    const startedAt = this._clock();
    const results: SecretRotationResult[] = [];
    const failedSecrets = new Set<string>();

    let waves: ReadonlyArray<ReadonlyArray<string>>;
    try {
      waves = this.graph.waves(targets);
    } catch (e) {
      // Cycle in the induced subgraph — nothing can run.
      const completedAt = this._clock();
      return {
        startedAt,
        completedAt,
        results: targets.map((t) => ({ secretId: t, status: 'skipped' as const, error: String(e) })),
        succeeded: 0,
        failed: 0,
        skipped: targets.length,
      };
    }

    const advance = advanceMs ?? Math.max(1, this._maxGraceMs() + 1);

    for (const wave of waves) {
      // Skip wave members transitively dependent on a failed secret.
      const runnable: string[] = [];
      for (const secretId of wave) {
        const blocker = [...failedSecrets].find((f) =>
          this.graph.dependenciesOf(secretId).includes(f) || this._dependsOnTransitively(secretId, f)
        );
        if (blocker) {
          results.push({ secretId, status: 'skipped', blockedBy: blocker });
        } else {
          runnable.push(secretId);
        }
      }

      // Rotate each runnable secret in the wave. Each rotator is pumped
      // independently: advance clock → tick → repeat until DONE/FAILED.
      for (const secretId of runnable) {
        const rt = this._secrets.get(secretId);
        if (!rt) {
          results.push({ secretId, status: 'skipped', error: 'secret not registered' });
          continue;
        }
        const rotator = new ZeroDowntimeRotator({
          ring: rt.ring,
          policy: rt.policy,
          factory: rt.factory,
          tracker: this.tracker,
          clock: this._clock,
        });

        const run = await rotator.begin();
        // Pump ticks until terminal, bounded to avoid pathological loops.
        let guard = 0;
        while (
          run.stage !== RotationStage.DONE &&
          run.stage !== RotationStage.FAILED &&
          guard++ < 1_000
        ) {
          const progressed = await rotator.tick();
          if (!progressed) {
            // Waiting on staging/dual-key/drain — advance simulated time.
            this._advance(advance);
          }
        }

        if (run.stage === RotationStage.DONE) {
          results.push({
            secretId,
            status: 'completed',
            newGeneration: run.newMaterial?.generation,
          });
        } else {
          // Recovery: roll back whatever partial work happened.
          rotator.rollback('fleet rotation failure');
          failedSecrets.add(secretId);
          results.push({
            secretId,
            status: 'rolled-back',
            error: run.error ?? 'rotation failed',
          });
          if (this._onFailure === 'abort-fleet') {
            // Skip everything else.
            for (const rest of waves.slice(waves.indexOf(wave) + 1).flat()) {
              results.push({ secretId: rest, status: 'skipped', blockedBy: secretId });
            }
            for (const rest of runnable.slice(runnable.indexOf(secretId) + 1)) {
              results.push({ secretId: rest, status: 'skipped', blockedBy: secretId });
            }
            return this._report(startedAt, results);
          }
        }
      }

      // Simulated inter-wave delay for consumer observation.
      if (this._waveDelayMs > 0) this._advance(this._waveDelayMs);
    }

    return this._report(startedAt, results);
  }

  private _report(startedAt: number, results: SecretRotationResult[]): FleetRotationReport {
    return {
      startedAt,
      completedAt: this._clock(),
      results,
      succeeded: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'rolled-back').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };
  }

  /** Does `id` transitively depend on `ancestor`? */
  private _dependsOnTransitively(id: string, ancestor: string): boolean {
    const seen = new Set<string>();
    const stack = this.graph.dependenciesOf(id).slice();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === ancestor) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...this.graph.dependenciesOf(cur));
    }
    return false;
  }

  private _maxGraceMs(): number {
    let m = 0;
    for (const rt of this._secrets.values()) {
      m = Math.max(m, rt.policy.graceMs, rt.policy.stagingMs ?? 0);
    }
    return m;
  }

}
