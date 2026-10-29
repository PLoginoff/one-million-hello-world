/**
 * Tests for UserAgentSignal.
 */

import { describe, it, expect } from 'bun:test';
import { UserAgentSignal } from '../strategies/UserAgentSignal';
import { BotSignalInput } from '../types/request';

function input(ua?: string): BotSignalInput {
  return { clientIp: '1.1.1.1', userAgent: ua, headers: {}, at: 0 };
}

describe('UserAgentSignal', () => {
  const signal = new UserAgentSignal();

  it('scores missing UA as suspicious', () => {
    const r = signal.evaluate(input(undefined));
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.signal).toBe('ua-missing');
  });

  it('scores very short UA as suspicious', () => {
    const r = signal.evaluate(input('bot'));
    expect(r.score).toBeGreaterThan(0.7);
  });

  it('recognizes Googlebot as a known bot', () => {
    const r = signal.evaluate(input('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
    expect(r.score).toBe(1);
    expect(r.signal).toBe('ua-known-bot');
    expect(r.reason).toContain('googlebot');
  });

  it('recognizes curl as a tool', () => {
    const r = signal.evaluate(input('curl/8.4.0'));
    expect(r.signal).toBe('ua-suspicious');
    expect(r.reason).toContain('curl');
  });

  it('recognizes python-requests', () => {
    const r = signal.evaluate(input('python-requests/2.31.0'));
    expect(r.signal).toBe('ua-suspicious');
  });

  it('recognizes headless chrome', () => {
    const r = signal.evaluate(input('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36'));
    expect(r.signal).toBe('ua-suspicious');
  });

  it('passes a real Chrome UA', () => {
    const r = signal.evaluate(
      input('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    );
    expect(r.signal).toBe('ua-clean');
    expect(r.score).toBe(0);
  });

  it('flags contradictory tokens (Mozilla + curl)', () => {
    const r = signal.evaluate(input('Mozilla/5.0 compatible; curl/8.0'));
    expect(r.score).toBeGreaterThan(0.5);
  });
});
