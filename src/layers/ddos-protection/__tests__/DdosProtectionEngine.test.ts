/**
 * Tests for DdosProtectionEngine (detector composition).
 */

import { describe, it, expect } from 'bun:test';
import { DdosProtectionEngine } from '../strategies/DdosProtectionEngine';
import { IpReputation } from '../strategies/IpReputation';
import { GeoBlocker } from '../strategies/GeoBlocker';
import { TrafficEvent } from '../types/traffic';

function ev(ip: string): TrafficEvent {
  return { srcIp: ip, protocol: 'HTTP', at: 0 };
}

describe('DdosProtectionEngine', () => {
  it('merges detector verdicts (highest severity wins)', () => {
    const engine = new DdosProtectionEngine();
    const rep = new IpReputation({ blockThreshold: 10, badEventCost: 10 });
    rep.recordBad('bad.ip', 1, 0); // score 10 → block
    const geo = new GeoBlocker();
    geo.addCidr('0.0.0.0/0', 'US'); // default: allow everyone

    engine.register(rep);
    engine.register(geo);

    const r = engine.inspect(ev('bad.ip'));
    expect(r.verdict).toBe('block');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('unregisters detectors by name', () => {
    const engine = new DdosProtectionEngine();
    const rep = new IpReputation();
    engine.register(rep);
    expect(engine.detectors.length).toBe(1);
    expect(engine.unregister('ip-reputation')).toBe(true);
    expect(engine.detectors.length).toBe(0);
  });

  it('allows clean traffic through all detectors', () => {
    const engine = new DdosProtectionEngine();
    engine.register(new IpReputation());
    engine.register(new GeoBlocker());
    expect(engine.inspect(ev('8.8.8.8')).verdict).toBe('allow');
  });
});
