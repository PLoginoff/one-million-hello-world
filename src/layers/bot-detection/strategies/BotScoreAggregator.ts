/**
 * BotScoreAggregator
 *
 * ML-style scoring: weighted sum of signal scores normalized by total weight
 * and average confidence. Classification bands:
 *
 *   score < 0.20                    → 'human'
 *   0.20 ≤ score < 0.40             → 'likely-human'
 *   0.40 ≤ score < 0.65             → 'suspicious'
 *   0.65 ≤ score                    → 'bot'
 *   any signal with score ≥ 0.95 at confidence ≥ 0.9
 *                                   → 'known-bot' (honeypot, verified crawler)
 *
 * Weights are tunable per signal. A signal's effective contribution is
 * `weight * score * confidence`, so a low-confidence signal has muted effect.
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, BotVerdict, IBotSignal, SignalResult, verdict } from '../types/request';

export interface AggregatorConfig {
  /** Classification thresholds. */
  humanBelow?: number;
  likelyHumanBelow?: number;
  suspiciousBelow?: number;
  /** A single "smoking gun" signal score+confidence that forces 'known-bot'. */
  knownBotScore?: number;
  knownBotConfidence?: number;
}

export class BotScoreAggregator {
  private readonly _signals: IBotSignal[] = [];
  private readonly _cfg: Required<AggregatorConfig>;

  constructor(config: AggregatorConfig = {}) {
    this._cfg = {
      humanBelow: config.humanBelow ?? 0.2,
      likelyHumanBelow: config.likelyHumanBelow ?? 0.4,
      suspiciousBelow: config.suspiciousBelow ?? 0.65,
      knownBotScore: config.knownBotScore ?? 0.95,
      knownBotConfidence: config.knownBotConfidence ?? 0.9,
    };
  }

  register(signal: IBotSignal): void {
    this._signals.push(signal);
  }

  unregister(name: string): boolean {
    const i = this._signals.findIndex((s) => s.name === name);
    if (i < 0) {
      return false;
    }
    this._signals.splice(i, 1);
    return true;
  }

  get signals(): readonly IBotSignal[] {
    return this._signals;
  }

  /**
   * Aggregate all signals on a request. Pure (no state mutation except what
   * signals themselves track — e.g. RequestFrequencySignal records the event).
   */
  score(input: BotSignalInput): BotVerdict {
    const results: SignalResult[] = this._signals.map((s) => s.evaluate(input));

    // Smoking-gun override (honeypot trip, known-bot UA).
    for (const r of results) {
      if (r.score >= this._cfg.knownBotScore && r.confidence >= this._cfg.knownBotConfidence) {
        return verdict(1, 'known-bot', results);
      }
    }

    // Weighted sum, normalized by total effective weight.
    let num = 0;
    let den = 0;
    for (let i = 0; i < results.length; i++) {
      const w = this._signals[i].weight;
      num += w * results[i].score * results[i].confidence;
      den += w;
    }
    const score = den === 0 ? 0 : num / den;

    let classification: BotVerdict['classification'];
    if (score < this._cfg.humanBelow) {
      classification = 'human';
    } else if (score < this._cfg.likelyHumanBelow) {
      classification = 'likely-human';
    } else if (score < this._cfg.suspiciousBelow) {
      classification = 'suspicious';
    } else {
      classification = 'bot';
    }
    return verdict(score, classification, results);
  }

  tick(now: number): void {
    for (const s of this._signals) {
      s.tick?.(now);
    }
  }
}
