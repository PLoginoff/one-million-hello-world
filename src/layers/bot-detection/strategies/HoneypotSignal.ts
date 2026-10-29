/**
 * HoneypotSignal
 *
 * Classic honeypot: the form contains a field that's invisible to humans
 * (CSS-hidden, named like `email2`, `website`, `fax`) but bots auto-fill.
 * If the value is non-empty → bot.
 *
 * Also supports a configurable "hidden-field allowlist" for known
 * legitimately-hidden inputs (e.g., CSRF token) so they don't trigger.
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, IBotSignal, SignalResult } from '../types/request';

export interface HoneypotConfig {
  /** Names of honeypot fields to watch. Defaults to common choices. */
  fieldNames?: readonly string[];
  /** Hidden fields that are legitimate (e.g., CSRF). */
  legitimateHiddenFields?: readonly string[];
}

const DEFAULT_HONEYPOTS = ['email2', 'website', 'url', 'fax', 'phone2', 'hp_', 'comment_url'];
const DEFAULT_LEGIT = ['_csrf', 'csrf_token', 'authenticity_token', '_token'];

export class HoneypotSignal implements IBotSignal {
  readonly name = 'honeypot';
  readonly weight = 4; // Honeypot trips are near-certain bots.

  private readonly _honeypots: Set<string>;
  private readonly _legit: Set<string>;

  constructor(config: HoneypotConfig = {}) {
    this._honeypots = new Set(config.fieldNames ?? DEFAULT_HONEYPOTS);
    this._legit = new Set(config.legitimateHiddenFields ?? DEFAULT_LEGIT);
  }

  evaluate(input: BotSignalInput): SignalResult {
    if (!input.honeypotFields) {
      return { signal: this.name, score: 0, confidence: 0.4, reason: 'no-form-data' };
    }
    for (const [k, v] of Object.entries(input.honeypotFields)) {
      if (this._legit.has(k)) {
        continue;
      }
      if (this._honeypots.has(k) || k.startsWith('hp_')) {
        if (v !== '' && v !== undefined) {
          return {
            signal: this.name,
            score: 1,
            confidence: 0.95,
            reason: `honeypot-field:${k}`,
          };
        }
      }
    }
    return { signal: this.name, score: 0, confidence: 0.8, reason: 'honeypot-empty' };
  }
}
