/**
 * Tests for HoneypotSignal and BotScoreAggregator.
 */

import { describe, it, expect } from 'bun:test';
import { HoneypotSignal } from '../strategies/HoneypotSignal';
import { BotScoreAggregator } from '../strategies/BotScoreAggregator';
import { UserAgentSignal } from '../strategies/UserAgentSignal';
import { HeaderConsistencySignal } from '../strategies/HeaderConsistencySignal';
import { BotSignalInput, IBotSignal } from '../types/request';

function input(over: Partial<BotSignalInput> = {}): BotSignalInput {
  return { clientIp: '1.1.1.1', headers: {}, at: 0, ...over };
}

describe('HoneypotSignal', () => {
  const sig = new HoneypotSignal();

  it('returns clean when no form data', () => {
    expect(sig.evaluate(input()).score).toBe(0);
  });

  it('trips when honeypot field is filled', () => {
    const r = sig.evaluate(
      input({ honeypotFields: { email2: 'spam@bot.com' } })
    );
    expect(r.score).toBe(1);
    expect(r.reason).toContain('email2');
  });

  it('ignores empty honeypot fields', () => {
    const r = sig.evaluate(input({ honeypotFields: { email2: '' } }));
    expect(r.score).toBe(0);
  });

  it('ignores legitimate hidden fields', () => {
    const r = sig.evaluate(input({ honeypotFields: { _csrf: 'token123' } }));
    expect(r.score).toBe(0);
  });
});

describe('BotScoreAggregator', () => {
  function fixedSignal(name: string, score: number, confidence: number, weight = 1): IBotSignal {
    return {
      name,
      weight,
      evaluate: () => ({ signal: name, score, confidence, reason: 'fixed' }),
    };
  }

  it('empty aggregator → score 0 / human', () => {
    const agg = new BotScoreAggregator();
    const v = agg.score(input());
    expect(v.score).toBe(0);
    expect(v.classification).toBe('human');
  });

  it('weighted average over signals', () => {
    const agg = new BotScoreAggregator();
    agg.register(fixedSignal('s1', 0.8, 1, 2));
    agg.register(fixedSignal('s2', 0.0, 1, 1));
    const v = agg.score(input());
    // (2*0.8*1 + 1*0*1) / 3 = 0.5333 → suspicious
    expect(v.score).toBeCloseTo(0.533, 2);
    expect(v.classification).toBe('suspicious');
  });

  it('low confidence mutes a signal', () => {
    const agg = new BotScoreAggregator();
    agg.register(fixedSignal('hi-conf', 0.9, 0.95, 1));
    agg.register(fixedSignal('lo-conf', 0.9, 0.1, 1));
    const v = agg.score(input());
    // (0.9*0.95 + 0.9*0.1) / 2 = 0.4725
    expect(v.score).toBeCloseTo(0.4725, 3);
  });

  it('honeypot trip forces known-bot classification', () => {
    const agg = new BotScoreAggregator();
    agg.register(new HoneypotSignal());
    agg.register(new UserAgentSignal());
    const v = agg.score(
      input({
        userAgent: 'Mozilla/5.0 Chrome',
        honeypotFields: { website: 'spammer.com' },
      })
    );
    expect(v.classification).toBe('known-bot');
    expect(v.score).toBe(1);
  });

  it('known-bot UA forces known-bot classification', () => {
    const agg = new BotScoreAggregator();
    agg.register(new UserAgentSignal());
    const v = agg.score(
      input({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })
    );
    expect(v.classification).toBe('known-bot');
  });

  it('realistic human request → human', () => {
    const agg = new BotScoreAggregator();
    agg.register(new UserAgentSignal());
    agg.register(new HeaderConsistencySignal());
    const v = agg.score(
      input({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        headers: {
          accept: 'text/html',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
          'sec-ch-ua': '"Chromium";v="120"',
          'sec-fetch-site': 'none',
        },
      })
    );
    expect(v.classification).toBe('human');
    expect(v.score).toBeLessThan(0.2);
  });

  it('realistic bot request (curl, minimal headers) → bot or suspicious', () => {
    const agg = new BotScoreAggregator();
    agg.register(new UserAgentSignal());
    agg.register(new HeaderConsistencySignal());
    const v = agg.score(input({ userAgent: 'curl/8.4.0', headers: {} }));
    expect(v.score).toBeGreaterThan(0.5);
    expect(v.classification).not.toBe('human');
    expect(v.classification).not.toBe('likely-human');
  });
});
