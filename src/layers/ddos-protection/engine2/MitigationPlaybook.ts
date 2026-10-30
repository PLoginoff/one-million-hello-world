/**
 * Mitigation Playbook Engine
 *
 * Drives an automated escalation ladder per attack class. Once an attack
 * is classified, the engine walks the playbook's ordered steps —
 * monitor → rate-limit → challenge → geo-filter → blackhole/scrub —
 * escalating when the attack persists past a step's dwell window and
 * de-escalating after a sustained quiet period.
 *
 * Why a ladder instead of jump-to-max: each rung has collateral cost
 * (rate-limits slow real users, blackholes drop everything). Escalating
 * only on persistence trades a bounded amount of damage for keeping
 * false positives cheap — a flash crowd gets rate-limited, not nuked.
 *
 * State machine:
 *
 *   idle ──classify──▶ mitigating(step 0)
 *   mitigating: attack persists  > dwellMs  → stepIndex++ (escalate)
 *               attack subsides  > quietMs  → cooldown
 *   cooldown:   quiet continues  > coolMs   → idle (reset)
 *               attack resumes              → mitigating (same step —
 *                                             hysteresis: don't restart
 *                                             the ladder for a relapse)
 *
 * Complexity: O(1) per evaluation — pure state transitions.
 *
 * @module DdosProtectionLayer/Engine2
 */

import {
  AttackClass,
  IClock,
  MitigationState,
  MitigationStatus,
  Playbook,
  SystemClock,
} from './types';

/** Default ladder per class — conservative first rungs, heavy last resorts. */
export const DEFAULT_PLAYBOOKS: readonly Playbook[] = [
  {
    name: 'volumetric-default',
    forClass: AttackClass.Volumetric,
    steps: [
      { action: 'monitor', params: {}, dwellMs: 10_000 },
      { action: 'rate-limit', params: { maxRequestsPerSec: 5000 }, dwellMs: 30_000 },
      { action: 'geo-filter', params: { regions: 'untrusted' }, dwellMs: 60_000 },
      { action: 'upstream-scrub', params: { provider: 'auto' }, dwellMs: 300_000 },
      { action: 'blackhole', params: { prefix: '/32' }, dwellMs: 600_000 },
    ],
  },
  {
    name: 'protocol-default',
    forClass: AttackClass.Protocol,
    steps: [
      { action: 'monitor', params: {}, dwellMs: 5_000 },
      { action: 'challenge', params: { type: 'syn-cookie' }, dwellMs: 30_000 },
      { action: 'rate-limit', params: { maxSynPerSec: 200, maxConnPerIp: 50 }, dwellMs: 60_000 },
      { action: 'blackhole', params: { prefix: '/32' }, dwellMs: 300_000 },
    ],
  },
  {
    name: 'application-default',
    forClass: AttackClass.Application,
    steps: [
      { action: 'monitor', params: {}, dwellMs: 15_000 },
      { action: 'rate-limit', params: { maxRequestsPerSec: 100, perIp: 1 }, dwellMs: 30_000 },
      { action: 'challenge', params: { type: 'js-pow' }, dwellMs: 60_000 },
      { action: 'geo-filter', params: { regions: 'untrusted' }, dwellMs: 120_000 },
      { action: 'blackhole', params: { prefix: '/32' }, dwellMs: 600_000 },
    ],
  },
  {
    name: 'unknown-default',
    forClass: AttackClass.Unknown,
    steps: [
      { action: 'monitor', params: {}, dwellMs: 30_000 },
      { action: 'rate-limit', params: { maxRequestsPerSec: 1000 }, dwellMs: 60_000 },
    ],
  },
];

export interface MitigationEngineConfig {
  /** Playbooks; defaults cover all four classes. */
  readonly playbooks?: readonly Playbook[];
  /** Quiet period before de-escalating to cooldown (ms). Default 60s. */
  readonly quietMs?: number;
  /** Cooldown duration before returning to idle (ms). Default 120s. */
  readonly cooldownMs?: number;
}

export class MitigationPlaybookEngine {
  private readonly _clock: IClock;
  private readonly _playbooks: Map<AttackClass, Playbook>;
  private readonly _quietMs: number;
  private readonly _cooldownMs: number;

  private _state = MitigationState.Idle;
  private _attackClass = AttackClass.Unknown;
  private _stepIndex = -1;
  private _stepStartedAt = 0;
  private _quietSince = 0;
  private _cooldownStartedAt = 0;
  private _escalations = 0;

  constructor(config: MitigationEngineConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._playbooks = new Map();
    for (const pb of config.playbooks ?? DEFAULT_PLAYBOOKS) {
      this._playbooks.set(pb.forClass, pb);
    }
    this._quietMs = config.quietMs ?? 60_000;
    this._cooldownMs = config.cooldownMs ?? 120_000;
  }

  /**
   * Advance the state machine.
   *
   * @param attackClass  latest classifier output (`Unknown` while idle is
   *                     a no-op; while mitigating it means "attack over").
   * @param attackActive whether the traffic is still anomalous — supplied
   *                     separately so the caller can combine classifier +
   *                     threshold evidence.
   */
  evaluate(attackClass: AttackClass, attackActive: boolean): MitigationStatus {
    const now = this._clock.now();

    switch (this._state) {
      case MitigationState.Idle:
        if (attackActive) this._startIncident(attackClass, now);
        break;

      case MitigationState.Mitigating:
        if (attackActive) {
          this._quietSince = 0;
          const step = this._currentStep();
          if (step && now - this._stepStartedAt >= step.dwellMs) {
            this._escalate(now);
          }
        } else {
          // First quiet tick — start the quiet clock.
          if (this._quietSince === 0) this._quietSince = now;
          if (now - this._quietSince >= this._quietMs) {
            this._state = MitigationState.Cooldown;
            this._cooldownStartedAt = now;
          }
        }
        break;

      case MitigationState.Cooldown:
        if (attackActive) {
          // Relapse: resume at the current rung — don't restart from
          // monitor for what's almost certainly the same incident.
          this._state = MitigationState.Mitigating;
          this._stepStartedAt = now;
          this._quietSince = 0;
        } else if (now - this._cooldownStartedAt >= this._cooldownMs) {
          this._state = MitigationState.Idle;
          this._stepIndex = -1;
          this._attackClass = AttackClass.Unknown;
          this._escalations = 0;
          this._quietSince = 0;
        }
        break;
    }
    return this.status();
  }

  /** Whether an action is currently active (mitigating, not monitor). */
  isMitigating(): boolean {
    return this._state === MitigationState.Mitigating && this._stepIndex >= 0;
  }

  /** Current status snapshot. */
  status(): MitigationStatus {
    const step = this._currentStep();
    return {
      state: this._state,
      attackClass: this._attackClass,
      stepIndex: this._stepIndex,
      currentAction: step ? step.action : 'none',
      stepStartedAt: this._stepStartedAt,
      escalations: this._escalations,
    };
  }

  /** The current step's action parameters (empty when idle). */
  currentParams(): Readonly<Record<string, number | string>> {
    return this._currentStep()?.params ?? {};
  }

  /** Admin reset — drops back to idle immediately. */
  reset(): void {
    this._state = MitigationState.Idle;
    this._attackClass = AttackClass.Unknown;
    this._stepIndex = -1;
    this._escalations = 0;
    this._quietSince = 0;
  }

  /* ---------------------------------------------------------------- */

  private _startIncident(cls: AttackClass, now: number): void {
    this._state = MitigationState.Mitigating;
    this._attackClass = cls;
    this._stepIndex = 0;
    this._stepStartedAt = now;
    this._quietSince = 0;
    this._escalations = 0;
  }

  private _escalate(now: number): void {
    const pb = this._playbooks.get(this._attackClass);
    if (pb && this._stepIndex < pb.steps.length - 1) {
      this._stepIndex += 1;
      this._stepStartedAt = now;
      this._escalations += 1;
    } else {
      // Top rung — hold it; restart the dwell clock so we keep reporting.
      this._stepStartedAt = now;
    }
  }

  private _currentStep() {
    if (this._state !== MitigationState.Mitigating || this._stepIndex < 0) return null;
    const pb = this._playbooks.get(this._attackClass);
    return pb?.steps[this._stepIndex] ?? null;
  }
}
