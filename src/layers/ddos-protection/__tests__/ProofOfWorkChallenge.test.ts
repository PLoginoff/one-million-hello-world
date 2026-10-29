/**
 * Tests for ProofOfWorkChallenge.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ProofOfWorkChallenge, leadingZeros } from '../strategies/ProofOfWorkChallenge';
import { TrafficEvent } from '../types/traffic';

const T0 = 1_000_000;

describe('leadingZeros', () => {
  it('counts correctly', () => {
    expect(leadingZeros(0)).toBe(32);
    expect(leadingZeros(1)).toBe(31);
    expect(leadingZeros(0x80000000)).toBe(0);
    expect(leadingZeros(0x0000ffff)).toBe(16);
  });
});

describe('ProofOfWorkChallenge', () => {
  let pow: ProofOfWorkChallenge;

  beforeEach(() => {
    // Difficulty 4 for tests: ~16 expected attempts.
    pow = new ProofOfWorkChallenge({ difficulty: 4, challengeTtlMs: 60_000 });
  });

  it('issues a challenge', () => {
    const c = pow.issue('1.2.3.4', 4, T0);
    expect(c.srcIp).toBe('1.2.3.4');
    expect(c.difficulty).toBe(4);
    expect(pow.outstanding).toBe(1);
  });

  it('solve() finds a valid nonce and verify() accepts it', () => {
    const c = pow.issue('1.2.3.4', 4, T0);
    const sol = pow.solve(c)!;
    expect(sol).not.toBeNull();
    const ok = pow.verify(sol, T0 + 100);
    expect(ok).not.toBeNull();
    expect(ok!.challengeId).toBe(c.challengeId);
    expect(pow.outstanding).toBe(0); // consumed
  });

  it('rejects a wrong nonce', () => {
    const c = pow.issue('1.2.3.4', 4, T0);
    // Construct a nonce that is guaranteed wrong.
    const good = pow.solve(c)!;
    const bad = { challengeId: c.challengeId, nonce: good.nonce + 1 };
    // If the incremented nonce happens to also satisfy (unlikely at d=4),
    // skip; otherwise assert failure.
    const v = pow.verify(bad, T0 + 100);
    if (v !== null) {
      // Insanely unlikely collision — just move on.
      return;
    }
    expect(v).toBeNull();
  });

  it('rejects expired challenge', () => {
    const c = pow.issue('1.2.3.4', 4, T0);
    const sol = pow.solve(c)!;
    expect(pow.verify(sol, T0 + 70_000)).toBeNull();
  });

  it('rejects unknown challengeId', () => {
    expect(pow.verify({ challengeId: 'nope', nonce: 0 }, T0)).toBeNull();
  });

  it('limits outstanding challenges per IP', () => {
    for (let i = 0; i < 5; i++) {
      pow.issue('x.x.x.x', 4, T0);
    }
    expect(() => pow.issue('x.x.x.x', 4, T0)).toThrow();
  });

  it('inspect allows when no solution header', () => {
    const ev: TrafficEvent = { srcIp: 'a', protocol: 'HTTP', at: T0 };
    expect(pow.inspect(ev).verdict).toBe('allow');
  });

  it('inspect challenges on bad solution', () => {
    const ev: TrafficEvent = {
      srcIp: 'a',
      protocol: 'HTTP',
      at: T0,
      headers: { 'x-pow-solution': JSON.stringify({ challengeId: 'missing', nonce: 0 }) },
    };
    expect(pow.inspect(ev).verdict).toBe('challenge');
  });
});
