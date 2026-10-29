/**
 * Tests for IpReputation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { IpReputation } from '../strategies/IpReputation';
import { TrafficEvent } from '../types/traffic';

function ev(ip: string, at: number = 0): TrafficEvent {
  return { srcIp: ip, protocol: 'HTTP', at };
}

describe('IpReputation', () => {
  let rep: IpReputation;

  beforeEach(() => {
    rep = new IpReputation({
      blockThreshold: 100,
      challengeThreshold: 40,
      halfLifeMs: 1000,
      badEventCost: 10,
      goodEventCredit: 1,
    });
  });

  it('allows unknown IPs', () => {
    expect(rep.inspect(ev('1.2.3.4')).verdict).toBe('allow');
  });

  it('score accumulates on bad events', () => {
    rep.recordBad('9.9.9.9', 1, 0);
    rep.recordBad('9.9.9.9', 1, 0);
    rep.recordBad('9.9.9.9', 1, 0);
    expect(rep.score('9.9.9.9', 0)).toBe(30);
  });

  it('verdicts climb through challenge → block', () => {
    for (let i = 0; i < 4; i++) rep.recordBad('a', 1, 0); // 40
    expect(rep.inspect(ev('a', 0)).verdict).toBe('challenge');
    for (let i = 0; i < 6; i++) rep.recordBad('a', 1, 0); // 100
    expect(rep.inspect(ev('a', 0)).verdict).toBe('block');
  });

  it('good events lower the score', () => {
    rep.recordBad('x', 5, 0); // 50
    for (let i = 0; i < 20; i++) rep.recordGood('x', 1, 0); // −20
    expect(rep.score('x', 0)).toBe(30);
  });

  it('score never goes below 0', () => {
    for (let i = 0; i < 50; i++) rep.recordGood('y', 1, 0);
    expect(rep.score('y', 0)).toBe(0);
  });

  it('decays exponentially toward 0 over time', () => {
    rep.recordBad('d', 10, 0); // score 100
    // After one half-life (1000ms), expect ~50.
    expect(rep.score('d', 1000)).toBeCloseTo(50, 0);
    // After two half-lives ~25.
    expect(rep.score('d', 2000)).toBeCloseTo(25, 0);
  });

  it('static blocklist wins over everything', () => {
    rep.blocklist('bad.actor');
    expect(rep.inspect(ev('bad.actor')).verdict).toBe('block');
  });

  it('static allowlist wins over accumulated score', () => {
    rep.recordBad('vip', 20, 0);
    rep.allowlist('vip');
    expect(rep.inspect(ev('vip')).verdict).toBe('allow');
    expect(rep.score('vip')).toBe(0);
  });

  it('weighted bad events hit harder', () => {
    rep.recordBad('w', 5, 0); // weight 5 → 50 points
    expect(rep.score('w', 0)).toBe(50);
  });
});
