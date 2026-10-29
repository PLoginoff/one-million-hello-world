/**
 * UserAgentSignal
 *
 * Scores the User-Agent header. Three sub-checks:
 *   1. Known-bot allowlist (Googlebot, Bingbot, etc.) — verified crawlers
 *      get a *high* score but classified separately so downstream can treat
 *      them as "known bots" not "attackers".
 *   2. Suspicious markers (curl, python-requests, headless, scrapy...).
 *   3. Structural anomalies: empty UA, absurdly short, only one token,
 *      known-browser strings missing, contradictory tokens.
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, IBotSignal, SignalResult } from '../types/request';

/** Known good crawlers (verified bots). */
export const KNOWN_BOTS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'googlebot', pattern: /\bgooglebot\b/i },
  { name: 'bingbot', pattern: /\bbingbot\b/i },
  { name: 'duckduckbot', pattern: /\bduckduckbot\b/i },
  { name: 'baiduspider', pattern: /\bbaiduspider\b/i },
  { name: 'yandexbot', pattern: /\byandexbot\b/i },
  { name: 'slackbot', pattern: /\bslackbot\b/i },
  { name: 'twitterbot', pattern: /\btwitterbot\b/i },
  { name: 'facebookexternalhit', pattern: /\bfacebookexternalhit\b/i },
  { name: 'applebot', pattern: /\bapplebot\b/i },
  { name: 'uptimerobot', pattern: /\buptimerobot\b/i },
];

/** Suspicious / scripted UA markers. */
export const SUSPICIOUS_UA_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'curl', pattern: /^curl\//i },
  { name: 'wget', pattern: /^wget\//i },
  { name: 'python-requests', pattern: /python-requests/i },
  { name: 'python-urllib', pattern: /python-urllib/i },
  { name: 'aiohttp', pattern: /\baiohttp\b/i },
  { name: 'scrapy', pattern: /\bscrapy\b/i },
  { name: 'httpclient', pattern: /apache-httpclient|okhttp|go-http-client/i },
  { name: 'java', pattern: /^java\/\d/i },
  { name: 'libwww', pattern: /libwww-perl|lwp-trivial/i },
  { name: 'headless-chrome', pattern: /headlesschrome/i },
  { name: 'phantomjs', pattern: /phantomjs/i },
  { name: 'selenium', pattern: /\bselenium\b/i },
  { name: 'puppeteer', pattern: /puppeteer|chrome-lighthouse/i },
  { name: 'sqlmap', pattern: /sqlmap/i },
  { name: 'nikto', pattern: /nikto/i },
  { name: 'masscan', pattern: /masscan/i },
  { name: 'nmap', pattern: /\bnmap\b/i },
];

/** Tokens a real browser UA almost always contains. */
const BROWSER_TOKENS = [/mozilla\/\d/i, /applewebkit|gecko|trident/i, /chrome|firefox|safari|edge|opera/i];

export class UserAgentSignal implements IBotSignal {
  readonly name = 'ua-analysis';
  readonly weight = 3; // UA is a strong prior

  evaluate(input: BotSignalInput): SignalResult {
    const ua = (input.userAgent ?? '').trim();

    if (ua.length === 0) {
      return {
        signal: 'ua-missing',
        score: 0.7,
        confidence: 0.6,
        reason: 'missing-user-agent',
      };
    }
    if (ua.length < 10) {
      return {
        signal: 'ua-too-short',
        score: 0.85,
        confidence: 0.7,
        reason: `ua-length:${ua.length}<10`,
      };
    }

    for (const b of KNOWN_BOTS) {
      if (b.pattern.test(ua)) {
        return {
          signal: 'ua-known-bot',
          score: 1,
          confidence: 0.95,
          reason: `verified-crawler:${b.name}`,
        };
      }
    }

    for (const s of SUSPICIOUS_UA_PATTERNS) {
      if (s.pattern.test(ua)) {
        return {
          signal: 'ua-suspicious',
          score: 0.9,
          confidence: 0.9,
          reason: `tool:${s.name}`,
        };
      }
    }

    const browserTokens = BROWSER_TOKENS.filter((t) => t.test(ua)).length;
    if (browserTokens === 0) {
      return {
        signal: 'ua-no-browser-tokens',
        score: 0.55,
        confidence: 0.6,
        reason: 'no-mozilla-webkit-or-engine',
      };
    }

    // Contradiction: claims to be a browser AND a tool.
    if (/mozilla/i.test(ua) && /(curl|python|scrapy|headless)/i.test(ua)) {
      return {
        signal: 'ua-contradictory',
        score: 0.85,
        confidence: 0.85,
        reason: 'browser-token-with-tool-token',
      };
    }

    return {
      signal: 'ua-clean',
      score: 0,
      confidence: 0.7,
      reason: 'browser-looking-ua',
    };
  }
}
