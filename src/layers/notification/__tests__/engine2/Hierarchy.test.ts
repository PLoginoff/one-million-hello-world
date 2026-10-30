/**
 * engine2 PreferenceHierarchy tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PreferenceHierarchy } from '../../engine2';

const M = { user: 'u1', team: 'eng', org: 'acme' };

describe('PreferenceHierarchy', () => {
  let h: PreferenceHierarchy;

  beforeEach(() => {
    h = new PreferenceHierarchy();
  });

  it('most-specific layer wins (user over team over org over global)', () => {
    h.set('global', 'billing', 'email', { pref: 'allow' });
    h.set('org:acme', 'billing', 'email', { pref: 'digest' });
    h.set('team:eng', 'billing', 'email', { pref: 'deny' });
    h.set('user:u1', 'billing', 'email', { pref: 'quiet' });
    const r = h.resolve(M, 'billing', 'email');
    expect(r.pref).toBe('quiet');
    expect(r.source).toBe('user');
    expect(r.sourceKey).toBe('user:u1');
  });

  it('falls through to the next layer when the top has no row', () => {
    h.set('org:acme', 'billing', 'sms', { pref: 'deny' });
    const r = h.resolve(M, 'billing', 'sms');
    expect(r.pref).toBe('deny');
    expect(r.source).toBe('org');
  });

  it('defaults to allow with no rows anywhere', () => {
    const r = h.resolve(M, 'nothing', 'push');
    expect(r.pref).toBe('allow');
    expect(r.source).toBe('global');
    expect(r.shadowed).toBe(false);
  });

  it('non-overridable deny at a wider layer blocks a narrower allow', () => {
    h.set('org:acme', 'marketing', 'email', { pref: 'deny', overridable: false });
    h.set('user:u1', 'marketing', 'email', { pref: 'allow' });
    const r = h.resolve(M, 'marketing', 'email');
    expect(r.pref).toBe('deny');
    expect(r.source).toBe('org');
    expect(r.shadowed).toBe(true);
  });

  it('overridable deny lets a narrower allow stand', () => {
    h.set('org:acme', 'marketing', 'email', { pref: 'deny', overridable: true });
    h.set('user:u1', 'marketing', 'email', { pref: 'allow' });
    const r = h.resolve(M, 'marketing', 'email');
    expect(r.pref).toBe('allow');
    expect(r.source).toBe('user');
  });

  it('deny defaults to non-overridable (compliance posture)', () => {
    h.set('global', 'security', 'sms', { pref: 'deny' }); // no overridable flag
    h.set('user:u1', 'security', 'sms', { pref: 'allow' });
    const r = h.resolve(M, 'security', 'sms');
    expect(r.pref).toBe('deny');
    expect(r.source).toBe('global');
  });

  it('a user with only user membership skips team/org layers', () => {
    h.set('team:other', 't', 'email', { pref: 'deny' });
    h.set('user:u2', 't', 'email', { pref: 'quiet' });
    const r = h.resolve({ user: 'u2' }, 't', 'email');
    expect(r.pref).toBe('quiet');
    expect(r.source).toBe('user');
  });

  it('clear removes rows selectively', () => {
    h.set('team:eng', 't', 'email', { pref: 'deny' });
    h.set('team:eng', 't', 'sms', { pref: 'digest' });
    h.clear('team:eng', 't', 'email');
    expect(h.rowsFor('team:eng', 't')).toEqual({ sms: { pref: 'digest' } });
  });
});
