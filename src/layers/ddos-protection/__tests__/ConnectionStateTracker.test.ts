/**
 * Tests for ConnectionStateTracker.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConnectionStateTracker } from '../strategies/ConnectionStateTracker';
import { TrafficEvent } from '../types/traffic';

const T0 = 1_000_000;

function ev(ip: string, port: number, proto: string, at: number = T0): TrafficEvent {
  return { srcIp: ip, srcPort: port, protocol: proto, at };
}

describe('ConnectionStateTracker', () => {
  let tracker: ConnectionStateTracker;

  beforeEach(() => {
    tracker = new ConnectionStateTracker({
      maxEstablishedPerSource: 5,
      maxHalfOpenPerSource: 3,
      embryonicTimeoutMs: 5000,
    });
  });

  it('tracks handshake lifecycle', () => {
    tracker.inspect(ev('1.1.1.1', 1000, 'TCP-SYN'));
    expect(tracker.countersFor('1.1.1.1')!.synReceived).toBe(1);
    tracker.inspect(ev('1.1.1.1', 1000, 'TCP-ACK'));
    const c = tracker.countersFor('1.1.1.1')!;
    expect(c.synReceived).toBe(0);
    expect(c.established).toBe(1);
  });

  it('blocks when half-open exceeds limit', () => {
    let v = 'allow';
    for (let i = 0; i < 5; i++) {
      v = tracker.inspect(ev('9.9.9.9', i, 'TCP-SYN')).verdict;
    }
    expect(v).toBe('block');
  });

  it('blocks when established exceeds limit', () => {
    for (let i = 0; i < 5; i++) {
      tracker.inspect(ev('2.2.2.2', i, 'TCP-SYN'));
      tracker.inspect(ev('2.2.2.2', i, 'TCP-ACK'));
    }
    // 6th → over the limit
    tracker.inspect(ev('2.2.2.2', 99, 'TCP-SYN'));
    const r = tracker.inspect(ev('2.2.2.2', 99, 'TCP-ACK'));
    expect(r.verdict).toBe('block');
  });

  it('totals() reflects state distribution', () => {
    tracker.inspect(ev('a', 1, 'TCP-SYN'));
    tracker.inspect(ev('a', 2, 'TCP-SYN'));
    tracker.inspect(ev('a', 2, 'TCP-ACK'));
    tracker.inspect(ev('b', 1, 'TCP-RST'));
    const t = tracker.totals();
    expect(t['syn-received']).toBe(1);
    expect(t['established']).toBe(1);
    expect(t['reset']).toBe(1);
  });

  it('tick reaps expired half-opens', () => {
    tracker.inspect(ev('c', 1, 'TCP-SYN', T0));
    tracker.inspect(ev('c', 2, 'TCP-SYN', T0));
    expect(tracker.totals()['syn-received']).toBe(2);
    const reaped = tracker.tick(T0 + 6000);
    expect(reaped).toBe(2);
    expect(tracker.totals()['syn-received']).toBe(0);
  });

  it('FIN closes the connection', () => {
    tracker.inspect(ev('d', 5, 'TCP-SYN'));
    tracker.inspect(ev('d', 5, 'TCP-ACK'));
    tracker.inspect(ev('d', 5, 'TCP-FIN'));
    const c = tracker.countersFor('d')!;
    expect(c.established).toBe(0);
    expect(c.closed).toBe(1);
  });
});
