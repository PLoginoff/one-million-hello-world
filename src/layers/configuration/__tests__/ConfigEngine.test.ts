/**
 * Configuration Engine — engine tests (merge, precedence, diff, reload,
 * validation-rollback, listeners, freeze, environment overrides).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ConfigEngine,
  ConfigPrecedence,
  ConfigValidationError,
  FrozenConfigError,
  ObjectConfigSource,
  layerFromObject,
} from '../engine';
import type { ConfigDiff, ConfigSource } from '../engine';

/** Mutable in-memory source for hot-reload tests. */
class MutableSource implements ConfigSource {
  readonly name = 'mutable';
  readonly precedence = ConfigPrecedence.REMOTE;
  entries: Record<string, string | number | boolean | null> = {};
  loadCalls = 0;
  load(): Record<string, string | number | boolean | null> {
    this.loadCalls++;
    return this.entries;
  }
}

function makeEngine(env = 'development'): ConfigEngine {
  const engine = new ConfigEngine({ environment: env });
  engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, {
    'server.port': 8080,
    'server.host': 'localhost',
    'db.host': 'db.local',
    'db.pool.min': 1,
    'db.pool.max': 10,
    'feature.alpha': false,
  });
  return engine;
}

describe('ConfigEngine > precedence merge', () => {
  let engine: ConfigEngine;
  beforeEach(async () => {
    engine = makeEngine();
    await engine.reload();
  });

  it('applies defaults when nothing overrides', () => {
    expect(engine.effective.getNumber('server.port')).toBe(8080);
    expect(engine.effective.getString('server.host')).toBe('localhost');
  });

  it('higher precedence wins; lower tiers survive for untouched keys', async () => {
    engine.addLayer('env', ConfigPrecedence.ENV, { 'server.port': 9090 });
    await engine.reload();
    expect(engine.effective.getNumber('server.port')).toBe(9090);
    expect(engine.effective.getNumber('db.pool.max')).toBe(10); // default survives
  });

  it('same precedence: later registration wins', async () => {
    engine.addLayer('env-1', ConfigPrecedence.ENV, { 'server.port': 1111 });
    engine.addLayer('env-2', ConfigPrecedence.ENV, { 'server.port': 2222 });
    await engine.reload();
    expect(engine.effective.getNumber('server.port')).toBe(2222);
    expect(engine.effective.origin('server.port')).toBe('env-2');
  });

  it('deep merge: overriding db.host preserves db.pool.* siblings', async () => {
    engine.addObjectLayer('file', ConfigPrecedence.FILE, {
      db: { host: 'db.prod', tls: true },
    });
    await engine.reload();
    expect(engine.effective.getString('db.host')).toBe('db.prod');
    expect(engine.effective.getNumber('db.pool.min')).toBe(1);
    expect(engine.effective.getBoolean('db.tls')).toBe(true);
  });

  it('null masks a lower-precedence value but is a real value', async () => {
    engine.addLayer('env', ConfigPrecedence.ENV, { 'db.host': null });
    await engine.reload();
    expect(engine.effective.get('db.host')).toBeNull();
  });

  it('arrays replace wholesale, not index-merge', async () => {
    engine.addLayer('defaults-arr', ConfigPrecedence.DEFAULTS, { 'srv.tags': ['a', 'b', 'c'] });
    engine.addLayer('env-arr', ConfigPrecedence.ENV, { 'srv.tags': ['x'] });
    await engine.reload();
    expect(engine.effective.get('srv.tags')).toEqual(['x']);
  });

  it('origin tracks the winning layer', async () => {
    engine.addLayer('env', ConfigPrecedence.ENV, { 'server.port': 9090 });
    await engine.reload();
    expect(engine.effective.origin('server.port')).toBe('env');
    expect(engine.effective.origin('server.host')).toBe('defaults');
  });
});

describe('ConfigEngine > sources + hot reload', () => {
  it('polls sources on reload and detects changes', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    src.entries = { 'remote.flag': 'v1' };
    engine.registerSource(src);
    await engine.reload();
    expect(engine.effective.getString('remote.flag')).toBe('v1');

    src.entries = { 'remote.flag': 'v2' };
    const res = await engine.reload();
    expect(res.applied).toBe(true);
    expect(res.diff.changed).toBe(true);
    expect(engine.effective.getString('remote.flag')).toBe('v2');
  });

  it('diff reports added/modified/removed with kinds', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    engine.registerSource(src);
    await engine.reload();

    src.entries = { 'server.port': 1234, 'new.key': 'hello' };
    const res = await engine.reload();
    const byPath = new Map(res.diff.changes.map((c) => [c.path, c.kind]));
    expect(byPath.get('server.port')).toBe('modified');
    expect(byPath.get('new.key')).toBe('added');

    src.entries = {};
    const res2 = await engine.reload();
    const removed = res2.diff.changes.find((c) => c.path === 'new.key');
    expect(removed?.kind).toBe('removed');
  });

  it('no-op reload produces unchanged diff', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    src.entries = { 'k.a': 1 };
    engine.registerSource(src);
    await engine.reload();
    const res = await engine.reload();
    expect(res.diff.changed).toBe(false);
  });
});

describe('ConfigEngine > schema validation + rollback', () => {
  it('rejects invalid config and keeps previous effective config', async () => {
    const engine = new ConfigEngine({
      environment: 'development',
      rules: [{ path: 'server.port', type: 'number', required: true, min: 1, max: 65535 }],
    });
    const src = new MutableSource();
    engine.registerSource(src);
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { 'server.port': 8080 });
    await engine.reload();
    expect(engine.effective.getNumber('server.port')).toBe(8080);

    src.entries = { 'server.port': 'not-a-number' };
    const res = await engine.reload();
    expect(res.applied).toBe(false);
    expect(res.rolledBack).toBe(true);
    expect(res.violations.length).toBe(1);
    expect(res.violations[0].kind).toBe('type');
    // Old value still live.
    expect(engine.effective.getNumber('server.port')).toBe(8080);
  });

  it('strict mode throws ConfigValidationError', async () => {
    const engine = new ConfigEngine({
      strictValidation: true,
      rules: [{ path: 'x', type: 'number', required: true }],
    });
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { x: 'abc' });
    await expect(engine.reload()).rejects.toThrow(ConfigValidationError);
  });

  it('wildcard rule applies to all matching paths', async () => {
    const engine = new ConfigEngine({
      rules: [{ path: 'services.*.timeout', type: 'number', min: 0 }],
    });
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, {
      'services.a.timeout': 100,
      'services.b.timeout': -5,
      'services.a.name': 'svc-a',
    });
    const res = await engine.reload();
    expect(res.applied).toBe(false);
    expect(res.violations[0].path).toBe('services.b.timeout');
    expect(res.violations[0].kind).toBe('range');
  });

  it('required rule reports missing keys', async () => {
    const engine = new ConfigEngine({ rules: [{ path: 'must.exist', required: true }] });
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, {});
    const res = await engine.reload();
    expect(res.violations.some((v) => v.kind === 'required')).toBe(true);
  });

  it('enum + pattern rules', async () => {
    const engine = new ConfigEngine({
      rules: [
        { path: 'log.level', enum: ['debug', 'info', 'warn', 'error'] },
        { path: 'host', pattern: /^[a-z0-9.-]+$/ },
      ],
    });
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { 'log.level': 'verbose', host: 'OK_HOST!' });
    const res = await engine.reload();
    const kinds = res.violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(['enum', 'pattern']);
  });
});

describe('ConfigEngine > change listeners', () => {
  it('fires listeners on change, not on no-op reload', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    engine.registerSource(src);
    await engine.reload();

    const diffs: ConfigDiff[] = [];
    engine.onChange((d) => diffs.push(d));

    await engine.reload(); // no change
    expect(diffs.length).toBe(0);

    src.entries = { 'x.y': 42 };
    await engine.reload();
    expect(diffs.length).toBe(1);
    expect(diffs[0].changes[0].path).toBe('x.y');
  });

  it('scoped listeners only see their prefix', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    engine.registerSource(src);
    await engine.reload();

    const dbDiffs: ConfigDiff[] = [];
    const allDiffs: ConfigDiff[] = [];
    engine.onChange((d) => dbDiffs.push(d), 'db');
    engine.onChange((d) => allDiffs.push(d));

    src.entries = { 'other.key': 1 };
    await engine.reload();
    expect(dbDiffs.length).toBe(0);
    expect(allDiffs.length).toBe(1);

    src.entries = { 'db.host': 'new-host', 'other.key': 2 };
    await engine.reload();
    expect(dbDiffs.length).toBe(1);
    expect(dbDiffs[0].changes.every((c) => c.path.startsWith('db'))).toBe(true);
  });

  it('unsubscribe stops notifications', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    engine.registerSource(src);
    await engine.reload();
    let calls = 0;
    const off = engine.onChange(() => calls++);
    src.entries = { a: 1 };
    await engine.reload();
    expect(calls).toBe(1);
    off();
    src.entries = { a: 2 };
    await engine.reload();
    expect(calls).toBe(1);
  });
});

describe('ConfigEngine > environment overrides + freeze + snapshots', () => {
  it('environment-scoped layers apply only in matching env', async () => {
    const layer = layerFromObject('prod-only', ConfigPrecedence.FILE, { 'db.host': 'prod.db' }, ['production']);
    const dev = new ConfigEngine({ environment: 'development' });
    dev.addLayer('defaults', ConfigPrecedence.DEFAULTS, { 'db.host': 'dev.db' });
    // push scoped layer into private staticLayers via addLayer signature
    dev.addLayer(layer.name, layer.precedence, layer.entries, layer.environments);
    await dev.reload();
    expect(dev.effective.getString('db.host')).toBe('dev.db');

    const prod = new ConfigEngine({ environment: 'production' });
    prod.addLayer('defaults', ConfigPrecedence.DEFAULTS, { 'db.host': 'dev.db' });
    prod.addLayer(layer.name, layer.precedence, layer.entries, layer.environments);
    await prod.reload();
    expect(prod.effective.getString('db.host')).toBe('prod.db');
  });

  it('runtime set/unset produce diffs and respect schema rollback', async () => {
    const engine = new ConfigEngine({ rules: [{ path: 'server.port', type: 'number' }] });
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { 'server.port': 8080 });
    await engine.reload();

    const res = engine.set('server.port', 9090);
    expect(res.applied).toBe(true);
    expect(engine.effective.getNumber('server.port')).toBe(9090);

    const bad = engine.set('server.port', 'oops');
    expect(bad.applied).toBe(false);
    expect(engine.effective.getNumber('server.port')).toBe(9090);

    engine.unset('server.port');
    expect(engine.effective.get('server.port')).toBeUndefined();
  });

  it('freeze locks mutation APIs', async () => {
    const engine = makeEngine();
    await engine.reload();
    engine.freeze();
    expect(engine.isFrozen).toBe(true);
    expect(() => engine.set('a.b', 1)).toThrow(FrozenConfigError);
    expect(() => engine.addLayer('x', ConfigPrecedence.DEFAULTS, {})).toThrow(FrozenConfigError);
  });

  it('snapshots are immutable and diffs chain', async () => {
    const engine = makeEngine();
    const src = new MutableSource();
    engine.registerSource(src);
    await engine.reload();
    const s1 = engine.snapshot();
    expect(s1.config.get('server.port')).toBe(8080);

    src.entries = { 'server.port': 1 };
    await engine.reload();
    const s2 = engine.snapshot();
    expect(s2.id).toBe(1);
    // Snapshot s1 unaffected by later changes.
    expect(s1.config.get('server.port')).toBe(8080);
    expect(s2.config.getNumber('server.port')).toBe(1);
    expect(s2.diffFromPrevious.changed).toBe(true);
    // Frozen tree can't be mutated.
    const tree = s1.config.toJSON(false) as { server: { port: number } };
    expect(() => {
      'use strict';
      tree.server.port = 0;
    }).toThrow();
  });
});

describe('ConfigEngine > typed getters', () => {
  it('coerces env-style strings into numbers/booleans', async () => {
    const engine = new ConfigEngine();
    engine.addLayer('env', ConfigPrecedence.ENV, { 'n': '42', 'b': 'yes', 's': 'hi' });
    await engine.reload();
    expect(engine.effective.getNumber('n')).toBe(42);
    expect(engine.effective.getBoolean('b')).toBe(true);
    expect(engine.effective.getString('s')).toBe('hi');
  });

  it('throws on missing key without fallback', async () => {
    const engine = makeEngine();
    await engine.reload();
    expect(() => engine.effective.getString('nope')).toThrow();
    expect(engine.effective.getString('nope', 'dflt')).toBe('dflt');
  });
});
