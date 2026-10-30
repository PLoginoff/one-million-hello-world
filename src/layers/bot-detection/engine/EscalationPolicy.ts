/**
 * EscalationPolicy — bot-score → challenge-level mapping.
 *
 * Blocking on a 0.7 score punishes false positives; challenging on a
 * 0.9 wastes challenge budget on near-certain bots. The standard
 * pattern is graduated friction:
 *
 *   < 0.30  pass                (normal traffic, no friction)
 *   < 0.50  silent-cookie       (set a cookie, watch for it)
 *   < 0.70  captcha-checkbox    (single-click)
 *   < 0.85  captcha-puzzle      (image select)
 *   < 0.95  js-challenge        (proof-of-work style)
 *   ≥ 0.95  block               (don't waste compute)
 *
 * Escalation state: if a subject *fails* a challenge and hits the
 * same endpoint again, the policy escalates one level past what the
 * score alone dictates (sticky hostility) — tracked per subject key
 * so repeat offenders ratchet upward while one-off hits don't.
 *
 * @module BotDetectionLayer/Engine
 */

import {
  BotClock,
  ChallengeLevel,
  EscalationDecision,
  SystemBotClock,
} from './types';

interface Band {
  readonly maxScore: number;
  readonly level: ChallengeLevel;
  readonly name: string;
}

const BANDS: readonly Band[] = [
  { maxScore: 0.3, level: 'pass', name: 'normal-traffic' },
  { maxScore: 0.5, level: 'silent-cookie', name: 'watch' },
  { maxScore: 0.7, level: 'captcha-checkbox', name: 'mild-suspicion' },
  { maxScore: 0.85, level: 'captcha-puzzle', name: 'suspicious' },
  { maxScore: 0.95, level: 'js-challenge', name: 'hostile' },
  { maxScore: Infinity, level: 'block', name: 'bot' },
];

const LEVEL_ORDER: readonly ChallengeLevel[] = BANDS.map((b) => b.level);

export class EscalationPolicy {
  private readonly _clock: BotClock;
  /** subject → consecutive failed-challenge count. */
  private readonly _failures: Map<string, number>;

  constructor(clock?: BotClock) {
    this._clock = clock ?? new SystemBotClock();
    this._failures = new Map();
  }

  /**
   * Decide the challenge for a bot score on a subject (IP/user).
   * If the subject has prior failed challenges, escalate one level
   * above the score's band.
   */
  decide(subject: string, score: number): EscalationDecision {
    const band = BANDS.find((b) => score < b.maxScore)!;
    const failures = this._failures.get(subject) ?? 0;
    let level = band.level;
    if (failures > 0) {
      const idx = LEVEL_ORDER.indexOf(band.level);
      const bumped = Math.min(LEVEL_ORDER.length - 1, idx + failures);
      level = LEVEL_ORDER[bumped];
    }
    return {
      level,
      score,
      band: band.name,
      escalationCount: failures,
    };
  }

  /** Record that a subject failed a challenge → future escalation. */
  recordFailure(subject: string): void {
    this._failures.set(subject, (this._failures.get(subject) ?? 0) + 1);
  }

  /** Challenge passed → reset the escalation ladder for this subject. */
  recordPass(subject: string): void {
    this._failures.delete(subject);
  }

  /** Current escalation count for a subject. */
  escalationOf(subject: string): number {
    return this._failures.get(subject) ?? 0;
  }
}
