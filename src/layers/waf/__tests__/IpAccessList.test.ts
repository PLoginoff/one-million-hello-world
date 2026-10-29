/**
 * Tests for IpAccessList.
 */

import { describe, it, expect } from 'bun:test';
import { IpAccessList } from '../strategies/IpAccessList';

describe('IpAccessList', () => {
  it('exact whitelist/blacklist', () => {
    const acl = new IpAccessList();
    acl.allow('10.0.0.1');
    acl.deny('10.0.0.2');
    expect(acl.check('10.0.0.1')).toBe('allow');
    expect(acl.check('10.0.0.2')).toBe('block');
    expect(acl.check('10.0.0.3')).toBe('neutral');
  });

  it('whitelist beats blacklist on exact IP', () => {
    const acl = new IpAccessList();
    acl.allow('1.1.1.1');
    acl.deny('1.1.1.1');
    expect(acl.check('1.1.1.1')).toBe('allow');
  });

  it('CIDR ranges match', () => {
    const acl = new IpAccessList();
    acl.deny('192.168.0.0/16');
    expect(acl.check('192.168.1.1')).toBe('block');
    expect(acl.check('192.169.0.1')).toBe('neutral');
    expect(acl.check('10.0.0.1')).toBe('neutral');
  });

  it('whitelist-CIDR beats blacklist-CIDR', () => {
    const acl = new IpAccessList();
    acl.allow('10.0.0.0/8');
    acl.deny('10.0.0.0/16'); // subset
    expect(acl.check('10.0.5.5')).toBe('allow'); // whitelist still wins
  });

  it('summary reports counts', () => {
    const acl = new IpAccessList();
    acl.allow('1.1.1.1');
    acl.allow('10.0.0.0/8');
    acl.deny('2.2.2.2');
    const s = acl.summary();
    expect(s.whitelist).toBe(1);
    expect(s.whitelistCidrs).toBe(1);
    expect(s.blacklist).toBe(1);
  });
});
