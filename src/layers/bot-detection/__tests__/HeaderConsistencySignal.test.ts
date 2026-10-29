/**
 * Tests for HeaderConsistencySignal.
 */

import { describe, it, expect } from 'bun:test';
import { HeaderConsistencySignal } from '../strategies/HeaderConsistencySignal';
import { BotSignalInput } from '../types/request';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function input(headers: Record<string, string>, ua = CHROME_UA): BotSignalInput {
  return { clientIp: '1.1.1.1', userAgent: ua, headers, at: 0 };
}

describe('HeaderConsistencySignal', () => {
  const sig = new HeaderConsistencySignal();

  it('full browser headers → clean', () => {
    const r = sig.evaluate(
      input({
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Chromium";v="120"',
        'sec-fetch-site': 'none',
        'sec-fetch-mode': 'navigate',
      })
    );
    expect(r.score).toBe(0);
    expect(r.reason).toBe('consistent');
  });

  it('missing Accept-Language → suspicious', () => {
    const r = sig.evaluate(
      input({
        accept: 'text/html',
        'accept-encoding': 'gzip',
        'sec-ch-ua': '"Chromium";v="120"',
        'sec-fetch-site': 'none',
      })
    );
    expect(r.reason).toContain('no-accept-language');
    expect(r.score).toBeGreaterThan(0);
  });

  it('bare request with nothing → very suspicious', () => {
    const r = sig.evaluate(input({}, 'curl/8.0'));
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.reason).toContain('no-accept');
  });

  it('Chrome UA without sec-ch-ua → flagged', () => {
    const r = sig.evaluate(
      input({
        accept: 'text/html',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
      })
    );
    expect(r.reason).toContain('chrome-ua-missing-sec-ch-ua');
  });
});
