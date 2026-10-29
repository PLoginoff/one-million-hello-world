/**
 * Tests for EtcdLikeAdapter (mock etcd).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EtcdLikeAdapter } from '../adapters/EtcdLikeAdapter';
import { createInstance } from '../types/service-instance';

function inst(id: string, svc = 'api') {
  return createInstance(id, svc, '10.0.0.1', 8080);
}

describe('EtcdLikeAdapter', () => {
  let etcd: EtcdLikeAdapter;

  beforeEach(() => {
    etcd = new EtcdLikeAdapter();
  });

  it('puts service under /services/<name>/<id>', () => {
    etcd.putService(inst('a', 'api'));
    expect(etcd.size).toBe(1);
    expect(etcd.range('/services/api/').map((i) => i.id)).toEqual(['a']);
  });

  it('bumps revision on every write', () => {
    expect(etcd.revision).toBe(0);
    etcd.putService(inst('a'));
    expect(etcd.revision).toBe(1);
    etcd.putService(inst('b'));
    expect(etcd.revision).toBe(2);
    etcd.deleteService('api', 'a');
    expect(etcd.revision).toBe(3);
  });

  it('second put same key bumps version not createRevision', () => {
    etcd.putService(inst('a'));
    const e2 = etcd.putService(inst('a'));
    expect(e2.version).toBe(2);
    expect(e2.createRevision).toBe(1);
    expect(e2.modRevision).toBe(2);
  });

  it('lease + keepalive prevents expiry', () => {
    const lease = etcd.grantLease(1); // 1s TTL
    etcd.putService(inst('a'), lease.leaseId);
    // Sweep at t=500 → not expired
    expect(etcd.expireLeases(lease.lastKeepaliveAt + 500)).toBe(0);
    // Sweep at t=2000 → lease expired, key deleted
    expect(etcd.expireLeases(lease.lastKeepaliveAt + 2000)).toBe(1);
    expect(etcd.get('a')).toBeUndefined();
  });

  it('lease keepalive resets the TTL window', () => {
    const lease = etcd.grantLease(1);
    const t0 = lease.lastKeepaliveAt;
    etcd.putService(inst('a'), lease.leaseId);
    etcd.keepalive(lease.leaseId, t0 + 900);
    expect(etcd.expireLeases(t0 + 1500)).toBe(0); // within new window
    expect(etcd.expireLeases(t0 + 2500)).toBe(1); // beyond new window
  });

  it('revokeLease deletes all attached keys', () => {
    const lease = etcd.grantLease(60);
    etcd.putService(inst('a'), lease.leaseId);
    etcd.putService(inst('b'), lease.leaseId);
    etcd.putService(inst('c')); // no lease
    expect(etcd.revokeLease(lease.leaseId)).toBe(2);
    expect(etcd.size).toBe(1);
    expect(etcd.get('c')).toBeDefined();
  });

  it('watchPrefix receives events for matching keys', () => {
    const events: string[] = [];
    etcd.watchPrefix('/services/api/', (ev) => events.push(`${ev.type}:${ev.key}`));
    etcd.putService(inst('a', 'api'));
    etcd.putService(inst('x', 'db')); // different prefix → filtered
    etcd.deleteService('api', 'a');
    expect(events).toEqual([
      'put:/services/api/a',
      'delete:/services/api/a',
    ]);
  });

  it('watchPrefix replays history from startRevision', () => {
    etcd.putService(inst('a'));
    etcd.putService(inst('b'));
    const events: string[] = [];
    // Subscribe after both puts; request replay since revision 2.
    etcd.watchPrefix('/services/api/', (ev) => events.push(ev.key), 2);
    expect(events).toEqual(['/services/api/b']);
  });

  it('heartbeat keeps lease alive for leased instance', () => {
    const lease = etcd.grantLease(1);
    const t0 = lease.lastKeepaliveAt;
    etcd.putService(inst('a'), lease.leaseId);
    etcd.heartbeat('a', t0 + 800);
    expect(etcd.expireLeases(t0 + 1500)).toBe(0);
  });

  it('tick() delegates to lease expiry', () => {
    const lease = etcd.grantLease(1);
    const t0 = lease.lastKeepaliveAt;
    etcd.putService(inst('a'), lease.leaseId);
    const { evicted } = etcd.tick(t0 + 5000);
    expect(evicted.map((i) => i.id)).toEqual(['a']);
  });
});
