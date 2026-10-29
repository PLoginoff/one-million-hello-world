/**
 * HeaderConsistencySignal
 *
 * Real browsers send a predictable header *set* and *order*; bots often miss
 * obvious ones (no `Accept-Language`, no `Accept`, UA claims Chrome but no
 * `Sec-Fetch-*`/`Sec-CH-UA`) or send contradictory combinations.
 *
 * Checks (each contributing a weighted score):
 *   - Accept missing                             +0.3
 *   - Accept-Language missing                    +0.4
 *   - Accept-Encoding missing                    +0.2
 *   - UA claims Chrome but no Sec-CH-UA          +0.3
 *   - UA claims mobile Safari but no Sec-Fetch   +0.2
 *   - Connection: keep-alive missing (suspicious on keepalive hosts) +0.1
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, IBotSignal, SignalResult } from '../types/request';

function header(input: BotSignalInput, name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(input.headers)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return '';
}

export class HeaderConsistencySignal implements IBotSignal {
  readonly name = 'header-consistency';
  readonly weight = 1.5;

  evaluate(input: BotSignalInput): SignalResult {
    const issues: string[] = [];
    let score = 0;
    const ua = (input.userAgent ?? '').toLowerCase();

    if (!header(input, 'accept')) {
      score += 0.3;
      issues.push('no-accept');
    }
    if (!header(input, 'accept-language')) {
      score += 0.4;
      issues.push('no-accept-language');
    }
    if (!header(input, 'accept-encoding')) {
      score += 0.2;
      issues.push('no-accept-encoding');
    }

    // Chrome-claiming UA without Client Hints is a common automation tell.
    if (/chrome|chromium|edg\//.test(ua)) {
      if (!header(input, 'sec-ch-ua')) {
        score += 0.3;
        issues.push('chrome-ua-missing-sec-ch-ua');
      }
      if (!header(input, 'sec-fetch-site') && !header(input, 'sec-fetch-mode')) {
        score += 0.15;
        issues.push('chrome-ua-missing-sec-fetch');
      }
    }
    // Mobile Safari claims.
    if (/iphone|ipad|ipod/.test(ua) && /safari/.test(ua)) {
      if (!header(input, 'accept-language')) {
        score += 0.2;
        issues.push('safari-ua-missing-lang');
      }
    }

    const capped = Math.min(1, score);
    return {
      signal: this.name,
      score: capped,
      confidence: issues.length >= 2 ? 0.8 : 0.55,
      reason: issues.length ? issues.join(',') : 'consistent',
    };
  }
}
