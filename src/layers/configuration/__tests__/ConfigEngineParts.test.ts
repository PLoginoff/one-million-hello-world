/**
 * Configuration Engine — unit tests for interpolation, masking, schema,
 * diff, and env source coercion.
 */

import { describe, it, expect } from 'bun:test';
import {
  ConfigDiffEngine,
  ConfigInterpolator,
  ConfigMerger,
  ConfigPrecedence,
  ConfigSchema,
  EnvConfigSource,
  InterpolationCycleError,
  MergedConfig,
  SecretMasker,
  coerceEnvValue,
  pathPatternToRegex,
  stableStringify,
} from '../engine';
import type { ConfigValue, EffectiveConfig } from '../engine';

function merged(entries: Record<string, ConfigValue>, masker = new SecretMasker()): MergedConfig {
  const m = new ConfigMerger();
  return m.merge([{ name: 't', precedence: ConfigPrecedence.DEFAULTS, entries }], 'development', masker);
}

describe('ConfigInterpolator', () => {
  const interp = new ConfigInterpolator({ allowEnv: false });

  it('resolves simple references', () => {
    const lookup = (p: string): ConfigValue | undefined => (p === 'db.host' ? 'h1' : undefined);
    expect(interp.resolve('postgres://${db.host}/x', lookup, 'db.url')).toBe('postgres://h1/x');
  });

  it('supports :-default', () => {
    const lookup = (): ConfigValue | undefined => undefined;
    expect(interp.resolve('${missing:-42}', lookup, 'x')).toBe('42');
  });

  it('nested references expand recursively', () => {
    const map = new Map<string, ConfigValue>([
      ['a', '${b}'],
      ['b', 'deep-${c}'],
      ['c', 'val'],
    ]);
    const out = interp.resolveAll(map);
    expect(out.get('a')).toBe('deep-val');
  });

  it('detects cycles with readable path', () => {
    const map = new Map<string, ConfigValue>([
      ['a', '${b}'],
      ['b', '${a}'],
    ]);
    expect(() => interp.resolveAll(map)).toThrow(InterpolationCycleError);
  });

  it('unresolved placeholders are reported and left in place', () => {
    const reported: string[] = [];
    const i = new ConfigInterpolator({ allowEnv: false, onUnresolved: (p, ph) => reported.push(`${p}|${ph}`) });
    const map = new Map<string, ConfigValue>([['x', 'hi ${no.key}']]);
    const out = i.resolveAll(map);
    expect(out.get('x')).toBe('hi ${no.key}');
    expect(reported.length).toBe(1);
  });
});

describe('SecretMasker', () => {
  it('wildcard regex matches correctly', () => {
    expect(pathPatternToRegex('db.password').test('db.password')).toBe(true);
    expect(pathPatternToRegex('db.password').test('db.host')).toBe(false);
    expect(pathPatternToRegex('services.*.key').test('services.a.key')).toBe(true);
    expect(pathPatternToRegex('services.*.key').test('services.a.b.key')).toBe(false);
    expect(pathPatternToRegex('**.token').test('a.b.c.token')).toBe(true);
    expect(pathPatternToRegex('**.token').test('token')).toBe(true);
    expect(pathPatternToRegex('vault.**').test('vault.a.b')).toBe(true);
  });

  it('masks secret paths in serialized tree', () => {
    const masker = new SecretMasker(['db.password', '**.token']);
    const cfg = merged({ 'db.password': 'hunter2', 'db.host': 'h', 'a.b.token': 't1' }, masker);
    const json = cfg.toJSON(true) as { db: { password: string; host: string }; a: { b: { token: string } } };
    expect(json.db.host).toBe('h');
    expect(json.db.password).not.toContain('hunter2');
    expect(json.a.b.token).not.toBe('t1');
  });

  it('unmasked serialization returns real values', () => {
    const masker = new SecretMasker(['db.password']);
    const cfg = merged({ 'db.password': 'hunter2' }, masker);
    const json = cfg.toJSON(false) as { db: { password: string } };
    expect(json.db.password).toBe('hunter2');
  });

  it('mask keeps length hint', () => {
    const masker = new SecretMasker(['k']);
    expect(masker.mask('abcdef')).toBe('***(6 chars)');
  });
});

describe('ConfigSchema', () => {
  it('reports all violations, not fail-fast', () => {
    const s = new ConfigSchema([
      { path: 'a', type: 'number' },
      { path: 'b', type: 'string' },
    ]);
    const cfg = merged({ a: 'str', b: 5 });
    const v = s.validate(cfg);
    expect(v.length).toBe(2);
  });

  it('non-required rules skip absent paths', () => {
    const s = new ConfigSchema([{ path: 'opt', type: 'number' }]);
    const v = s.validate(merged({ other: 1 }));
    expect(v.length).toBe(0);
  });

  it('custom validate returning message', () => {
    const s = new ConfigSchema([
      { path: 'port', validate: (v) => (typeof v === 'number' && v > 1024 ? true : 'must be >1024') },
    ]);
    const v = s.validate(merged({ port: 80 }));
    expect(v[0].kind).toBe('custom');
    expect(v[0].message).toBe('must be >1024');
  });
});

describe('ConfigDiffEngine', () => {
  it('diffs two effective configs', () => {
    const a = merged({ 'x.a': 1, 'x.b': 2 });
    const b = merged({ 'x.a': 1, 'x.b': 3, 'x.c': 9 });
    const d = new ConfigDiffEngine().diff(a as EffectiveConfig, b as EffectiveConfig, 100);
    expect(d.at).toBe(100);
    const kinds = new Map(d.changes.map((c) => [c.path, c.kind]));
    expect(kinds.get('x.b')).toBe('modified');
    expect(kinds.get('x.c')).toBe('added');
    expect(kinds.has('x.a')).toBe(false);
  });

  it('null → config diff is all-added', () => {
    const b = merged({ a: 1 });
    const d = new ConfigDiffEngine().diff(null, b, 0);
    expect(d.changes.every((c) => c.kind === 'added')).toBe(true);
  });
});

describe('EnvConfigSource', () => {
  it('maps PREFIXED vars to dot paths with coercion', () => {
    const src = new EnvConfigSource({ prefix: 'APP_', env: { APP_DB__HOST: 'x', APP_DB__PORT: '5432', OTHER: 'y' } });
    const out = src.load();
    expect(out['db.host']).toBe('x');
    expect(out['db.port']).toBe(5432);
    expect('other' in out).toBe(false);
  });

  it('coerces scalars', () => {
    expect(coerceEnvValue('true')).toBe(true);
    expect(coerceEnvValue('3.14')).toBe(3.14);
    expect(coerceEnvValue('null')).toBeNull();
    expect(coerceEnvValue("'42'")).toBe('42');
    expect(coerceEnvValue('[1,2]')).toEqual([1, 2]);
    expect(coerceEnvValue('abc')).toBe('abc');
  });
});

describe('misc', () => {
  it('stableStringify is key-order independent', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
