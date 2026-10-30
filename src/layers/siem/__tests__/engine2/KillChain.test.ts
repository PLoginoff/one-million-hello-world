/**
 * engine2 KillChainTracker tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine';
import type { NormalizedEvent } from '../../engine/EventNormalizer';
import { KillChainTracker, STAGE_ORDER } from '../../engine2';

let seq = 0;
function ev(over: Partial<NormalizedEvent>): NormalizedEvent {
  seq += 1;
  return {
    id: seq,
    timestampMs: 0,
    raw: '',
    severity: 'info',
    outcome: 'unknown',
    fields: {},
    parseQuality: 'full',
    ...over,
  };
}

describe('KillChainTracker', () => {
  let clock: ManualClock;
  let t: KillChainTracker;

  beforeEach(() => {
    clock = new ManualClock(0);
    t = new KillChainTracker(undefined, clock);
  });

  it('tracks stage progression forward-only', () => {
    t.ingest(ev({ sourceIp: '1.2.3.4', action: 'port-scan', timestampMs: 0 }));
    t.ingest(ev({ sourceIp: '1.2.3.4', action: 'exploit', timestampMs: 1_000 }));
    t.ingest(ev({ sourceIp: '1.2.3.4', action: 'beacon', timestampMs: 2_000 }));
    const p = t.progress('1.2.3.4')!;
    expect(p.watermarkStage).toBe('c2');
    expect(p.watermark).toBe(STAGE_ORDER.indexOf('c2'));
    expect(p.eventCount).toBe(3);
  });

  it('out-of-order stage hits do not lower the watermark', () => {
    t.ingest(ev({ sourceIp: 'x', action: 'exfil', timestampMs: 0 }));
    t.ingest(ev({ sourceIp: 'x', action: 'port-scan', timestampMs: 1_000 }));
    const p = t.progress('x')!;
    expect(p.watermarkStage).toBe('exfiltration');
    // But the recon hit is recorded.
    expect(p.stageHits['recon']).toBe(1_000);
  });

  it('unmapped actions do not progress the chain', () => {
    t.ingest(ev({ sourceIp: 'y', action: 'login', timestampMs: 0 }));
    expect(t.progress('y')!.watermark).toBe(-1);
  });

  it('atLeast lists entities past a stage, deepest first', () => {
    t.ingest(ev({ sourceIp: 'a', action: 'port-scan', timestampMs: 0 }));
    t.ingest(ev({ sourceIp: 'b', action: 'beacon', timestampMs: 0 }));
    t.ingest(ev({ sourceIp: 'c', action: 'exfil', timestampMs: 0 }));
    const deep = t.atLeast('c2');
    expect(deep.map((d) => d.entity)).toEqual(['c', 'b']);
  });

  it('dwell time measures the slowest stage gap', () => {
    t.ingest(ev({ sourceIp: 'z', action: 'port-scan', timestampMs: 0 }));
    t.ingest(ev({ sourceIp: 'z', action: 'exploit', timestampMs: 60_000 }));
    t.ingest(ev({ sourceIp: 'z', action: 'beacon', timestampMs: 70_000 }));
    expect(t.progress('z')!.maxDwellMs).toBe(60_000);
  });

  it('ingest returns a snapshot only when a stage advances', () => {
    const first = t.ingest(ev({ sourceIp: 'w', action: 'port-scan', timestampMs: 0 }));
    expect(first?.watermarkStage).toBe('recon');
    const noise = t.ingest(ev({ sourceIp: 'w', action: 'login', timestampMs: 1 }));
    expect(noise).toBeUndefined();
  });
});
