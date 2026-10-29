/**
 * Tests for GeoBlocker.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { GeoBlocker, ipv4ToInt } from '../strategies/GeoBlocker';
import { TrafficEvent } from '../types/traffic';

function ev(ip: string): TrafficEvent {
  return { srcIp: ip, protocol: 'HTTP', at: 0 };
}

describe('ipv4ToInt', () => {
  it('converts dotted IPv4', () => {
    expect(ipv4ToInt('0.0.0.0')).toBe(0);
    expect(ipv4ToInt('255.255.255.255')).toBe(0xffffffff);
    expect(ipv4ToInt('10.0.0.1')).toBe(0x0a000001);
  });
  it('rejects malformed input', () => {
    expect(ipv4ToInt('999.1.1.1')).toBeNull();
    expect(ipv4ToInt('a.b.c.d')).toBeNull();
    expect(ipv4ToInt('1.2.3')).toBeNull();
  });
});

describe('GeoBlocker', () => {
  let geo: GeoBlocker;

  beforeEach(() => {
    geo = new GeoBlocker();
    geo.addCidr('1.0.0.0/8', 'CN');
    geo.addCidr('5.0.0.0/8', 'RU');
    geo.addCidr('9.0.0.0/8', 'US');
    geo.blockCountry('CN');
    geo.challengeCountry('RU');
  });

  it('blocks from blocked country', () => {
    expect(geo.inspect(ev('1.2.3.4')).verdict).toBe('block');
  });

  it('challenges gray-list country', () => {
    expect(geo.inspect(ev('5.6.7.8')).verdict).toBe('challenge');
  });

  it('allows unlisted countries', () => {
    expect(geo.inspect(ev('9.9.9.9')).verdict).toBe('allow');
  });

  it('allows unknown IPs', () => {
    expect(geo.inspect(ev('200.1.2.3')).verdict).toBe('allow');
  });

  it('longest-prefix match wins', () => {
    geo.addCidr('1.2.3.0/24', 'US'); // overrides the /8 → CN
    expect(geo.countryFor('1.2.3.4')).toBe('US');
    expect(geo.countryFor('1.2.9.9')).toBe('CN'); // still /8
  });

  it('exact-IP override wins', () => {
    geo.addExact('1.2.3.4', 'US');
    expect(geo.countryFor('1.2.3.4')).toBe('US');
  });

  it('unblockCountry removes the block', () => {
    geo.unblockCountry('CN');
    expect(geo.inspect(ev('1.2.3.4')).verdict).toBe('allow');
  });
});
