/**
 * Event normalization tests.
 */

import { describe, it, expect } from 'bun:test';
import { EventNormalizer, decodePri } from '../../engine/EventNormalizer';

describe('decodePri', () => {
  it('splits facility and severity', () => {
    expect(decodePri(13)).toEqual({ facility: 1, severity: 'notice' }); // 13 = 1*8+5
    expect(decodePri(35)).toEqual({ facility: 4, severity: 'err' }); // 35 = 4*8+3
    expect(decodePri(38)).toEqual({ facility: 4, severity: 'info' }); // 38 = 4*8+6
  });
});

describe('EventNormalizer', () => {
  const normalizer = new EventNormalizer(undefined, () => 1_700_000_000_000);

  it('parses an RFC 3164 syslog line', () => {
    const e = normalizer.normalize(
      '<34>Oct 11 22:14:15 mymachine su: failed password for root from 10.0.0.5'
    );
    expect(e.parseQuality).toBe('full');
    expect(e.severity).toBe('crit'); // 34 & 7 = 2 = crit
    expect(e.sourceHost).toBe('mymachine');
    expect(e.sourceProcess).toBe('su');
    expect(e.action).toBe('login');
    expect(e.outcome).toBe('failure');
    expect(e.sourceIp).toBe('10.0.0.5');
    expect(e.user).toBe('root');
  });

  it('classifies accepted login as success', () => {
    const e = normalizer.normalize(
      '<86>Nov  3 10:00:00 bastion sshd[1234]: Accepted publickey for alice from 192.168.1.10'
    );
    expect(e.action).toBe('login');
    expect(e.outcome).toBe('success');
    expect(e.user).toBe('alice');
  });

  it('parses key=value lines', () => {
    const e = normalizer.normalize(
      'time=2024-01-15T08:00:00Z srcip=10.1.1.1 dstip=10.2.2.2 user=bob action=login outcome=failure msg="login denied"'
    );
    expect(e.sourceIp).toBe('10.1.1.1');
    expect(e.destIp).toBe('10.2.2.2');
    expect(e.user).toBe('bob');
    expect(e.outcome).toBe('failure');
    expect(e.timestampMs).toBe(Date.parse('2024-01-15T08:00:00Z'));
  });

  it('parses JSON events', () => {
    const e = normalizer.normalize(
      '{"timestamp":"2024-02-01T00:00:00Z","severity":"warning","user":"carol","action":"file-read","outcome":"success","message":"read /etc/passwd"}'
    );
    expect(e.severity).toBe('warning');
    expect(e.user).toBe('carol');
    expect(e.action).toBe('file-read');
    expect(e.outcome).toBe('success');
  });

  it('falls back to plain text with partial quality', () => {
    const e = normalizer.normalize('some completely unstructured line');
    expect(e.parseQuality).toBe('partial');
    expect(e.severity).toBe('info');
    expect(e.timestampMs).toBe(1_700_000_000_000); // ingest time fallback
  });

  it('assigns monotonically increasing ids', () => {
    const n = new EventNormalizer();
    const a = n.normalize('x');
    const b = n.normalize('y');
    expect(b.id).toBe(a.id + 1);
  });
});
