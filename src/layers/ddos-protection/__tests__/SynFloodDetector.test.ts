/**
 * Tests for SynFloodDetector.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SynFloodDetector } from '../strategies/SynFloodDetector';
import { TrafficEvent } from '../types/traffic';

const T0 = 1_000_000;

function syn(ip: string, port: number, at: number = T0): TrafficEvent {
  return { srcIp: ip, srcPort: port, protocol: 'TCP-SYN', at };
}

function ack(ip: string, port: number, at: number = T0): TrafficEvent {
  return { srcIp: ip, srcPort: port, protocol: 'TCP-ACK', at };
}

describe('SynFloodDetector', () => {
  let det: SynFloodDetector;

  beforeEach(() => {
    det = new SynFloodDetector({
      halfOpenThreshold: 5,
      synRatePerSec: 10,
      rateWindowMs: 1000,
      embryonicTimeoutMs: 5000,
      globalHalfOpenLimit: 1000,
    });
  });

  it('allows normal handshakes', () => {
    expect(det.inspect(syn('1.2.3.4', 1000)).verdict).toBe('allow');
    expect(det.inspect(ack('1.2.3.4', 1000)).verdict).toBe('allow');
    expect(det.halfOpenFor('1.2.3.4')).toBe(0);
  });

  it('blocks when per-source half-open exceeds threshold', () => {
    let last: 'allow' | 'block' = 'allow';
    for (let i = 0; i < 8; i++) {
      last = det.inspect(syn('9.9.9.9', i)).verdict;
    }
    expect(last).toBe('block');
    expect(det.halfOpenFor('9.9.9.9')).toBe(8);
  });

  it('does NOT flag distinct sources under threshold', () => {
    for (let i = 0; i < 50; i++) {
      expect(det.inspect(syn(`10.0.0.${i}`, 80)).verdict).toBe('allow');
    }
    expect(det.totalHalfOpen).toBe(50);
  });

  it('clears half-open on ACK', () => {
    det.inspect(syn('5.5.5.5', 1111));
    det.inspect(syn('5.5.5.5', 1112));
    expect(det.halfOpenFor('5.5.5.5')).toBe(2);
    det.inspect(ack('5.5.5.5', 1111));
    expect(det.halfOpenFor('5.5.5.5')).toBe(1);
  });

  it('reaps embryonic connections on tick', () => {
    det.inspect(syn('7.7.7.7', 1, T0));
    det.inspect(syn('7.7.7.7', 2, T0));
    expect(det.totalHalfOpen).toBe(2);
    const reaped = det.tick(T0 + 6000);
    expect(reaped).toBe(2);
    expect(det.totalHalfOpen).toBe(0);
    expect(det.halfOpenFor('7.7.7.7')).toBe(0);
  });

  it('flags high SYN rate from one source', () => {
    // 15 SYNs within 1s from one IP > 10/s limit.
    let v = 'allow';
    for (let i = 0; i < 15; i++) {
      v = det.inspect(syn('8.8.8.8', i, T0 + i * 50)).verdict;
    }
    expect(v).toBe('block');
  });

  it('ignores non-TCP protocols', () => {
    expect(det.inspect({ srcIp: '1.1.1.1', protocol: 'HTTP', at: T0 }).verdict).toBe('allow');
  });
});
