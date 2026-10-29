/**
 * Secrets — policy engine + rotation scheduler tests.
 */

import { describe, it, expect } from 'bun:test';
import { SecretPolicyEngine, SecretRotator, VersionedSecretProvider } from '../vault';

describe('SecretPolicyEngine', () => {
  it('deny-by-default; explicit deny wins over allow', () => {
    const e = new SecretPolicyEngine();
    e.addPolicy({
      name: 'dev',
      rules: [
        { path: 'kv/dev/**', capabilities: ['read', 'write'] },
        { path: 'kv/dev/prod-secret', capabilities: ['read'], effect: 'deny' },
      ],
    });
    e.bind('alice', ['dev']);

    expect(e.isAllowed('alice', 'read', 'kv/dev/db')).toBe(true);
    expect(e.isAllowed('alice', 'write', 'kv/dev/db')).toBe(true);
    expect(e.isAllowed('alice', 'read', 'kv/dev/prod-secret')).toBe(false); // deny wins
    expect(e.isAllowed('alice', 'delete', 'kv/dev/db')).toBe(false); // capability not granted
    expect(e.isAllowed('alice', 'read', 'kv/prod/db')).toBe(false); // outside pattern
    expect(e.isAllowed('nobody', 'read', 'kv/dev/db')).toBe(false); // no bindings
  });

  it('capability-specific grants + filter', () => {
    const e = new SecretPolicyEngine();
    e.addPolicy({ name: 'ro', rules: [{ path: 'kv/**', capabilities: ['read', 'list'] }] });
    e.bind('reader', ['ro']);
    const paths = ['kv/a', 'kv/b/c', 'other/x'];
    expect(e.filterAllowed('reader', 'read', paths)).toEqual(['kv/a', 'kv/b/c']);
  });
});

describe('SecretRotator', () => {
  it('rotates due paths, versions up, honors grace window', async () => {
    let t = 0;
    const provider = new VersionedSecretProvider({ clock: () => t, gracePeriodMs: 500 });
    const rotator = new SecretRotator(provider, { clock: () => t });
    let seq = 0;
    rotator.register({ path: 'kv/api/key', rotateEveryMs: 1000, generator: () => `key-${++seq}` });

    // Not due yet.
    t = 999;
    expect(rotator.due()).toEqual([]);
    await provider.put('kv/api/key', 'key-0');

    t = 1001;
    const rotated = await rotator.tick();
    expect(rotated.length).toBe(1);
    expect(rotated[0].toVersion).toBe(2);
    expect((await provider.get('kv/api/key'))?.value).toBe('key-1');
    // Old version still inside grace.
    expect((await provider.getVersion('kv/api/key', 1))?.value).toBe('key-0');
    expect(rotator.history('kv/api/key').length).toBe(1);
  });

  it('generator failure backs off linearly without stalling others', async () => {
    let t = 0;
    const provider = new VersionedSecretProvider({ clock: () => t });
    const rotator = new SecretRotator(provider, { clock: () => t });
    let fail = true;
    rotator.register({ path: 'bad', rotateEveryMs: 100, generator: () => { if (fail) throw new Error('upstream'); return 'ok'; } });
    rotator.register({ path: 'good', rotateEveryMs: 100, generator: () => 'good' });

    await provider.put('bad', 'v0');
    await provider.put('good', 'v0');
    t = 200;
    const rotated = await rotator.tick();
    expect(rotated.length).toBe(1); // only 'good' succeeded
    expect(rotated[0].path).toBe('good');
    expect(rotator.errors().length).toBe(1);
    expect(rotator.errors()[0].consecutiveFailures).toBe(1);

    // 'bad' is in backoff — next tick skips it.
    t = 250;
    expect(rotator.due()).toEqual([]);

    fail = false;
    t = 2000;
    const r2 = await rotator.tick();
    expect(r2.some((x) => x.path === 'bad')).toBe(true);
  });
});
