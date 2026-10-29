/**
 * RequestFrequencySignal
 *
 * Per-IP request rate over a sliding window. Humans click at ~1 req/5s
 * peak; sustained >10 req/s is a bot unless the caller is a crawler or API.
 *
 * Two bands:
 *   rate > burstThreshold      → 'likely-bot'   (0.7)
 *   rate > sustainedThreshold  → 'bot'          (0.95)
 *
 * The window is a circular buffer of event timestamps per IP — simple,
 * bounded, and enough to compute a rate at any `now`.
 *
 * O(1) amortized per event.
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, IBotSignal, SignalResult } from '../types/request';

export interface FrequencyConfig {
  /** Window length in ms. Default 10_000. */
  windowMs?: number;
  /** Events/sec above which we're suspicious. Default 5. */
  burstThreshold?: number;
  /** Events/sec above which we're confident bot. Default 20. */
  sustainedThreshold?: number;
}

export class RequestFrequencySignal implements IBotSignal {
  readonly name = 'request-frequency';
  readonly weight = 2;

  private readonly _windowMs: number;
  private readonly _burst: number;
  private readonly _sustained: number;
  private readonly _events: Map<string, number[]>;

  constructor(config: FrequencyConfig = {}) {
    this._windowMs = config.windowMs ?? 10_000;
    this._burst = config.burstThreshold ?? 5;
    this._sustained = config.sustainedThreshold ?? 20;
    this._events = new Map();
  }

  evaluate(input: BotSignalInput): SignalResult {
    const list = this._list(input.clientIp);
    list.push(input.at);
    this._prune(list, input.at);

    const rate = (list.length * 1000) / this._windowMs;
    if (rate > this._sustained) {
      return {
        signal: this.name,
        score: 0.95,
        confidence: 0.9,
        reason: `sustained:${rate.toFixed(1)}/s>${this._sustained}`,
      };
    }
    if (rate > this._burst) {
      return {
        signal: this.name,
        score: 0.7,
        confidence: 0.7,
        reason: `burst:${rate.toFixed(1)}/s>${this._burst}`,
      };
    }
    return { signal: this.name, score: 0, confidence: 0.8, reason: `rate:${rate.toFixed(1)}/s` };
  }

  /** Reset per-IP windows. */
  tick(now: number): void {
    for (const [ip, list] of Array.from(this._events.entries())) {
      this._prune(list, now);
      if (list.length === 0) {
        this._events.delete(ip);
      }
    }
  }

  private _list(ip: string): number[] {
    let l = this._events.get(ip);
    if (!l) {
      l = [];
      this._events.set(ip, l);
    }
    return l;
  }

  private _prune(list: number[], now: number): void {
    const cutoff = now - this._windowMs;
    while (list.length > 0 && list[0] < cutoff) {
      list.shift();
    }
  }
}
