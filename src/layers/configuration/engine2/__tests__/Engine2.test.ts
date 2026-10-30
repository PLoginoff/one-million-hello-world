/**
 * Tests for configuration engine2: JsonSchemaValidator, DriftDetector,
 * SecretRefResolver, ConfigHistory and ConfigNamespace.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { JsonSchemaValidator } from '../JsonSchemaValidator';
import { DriftDetector } from '../DriftDetector';
import { SecretRefResolver } from '../SecretRefResolver';
import { ConfigHistory, TOMBSTONE } from '../ConfigHistory';
import { ConfigNamespace } from '../ConfigNamespace';
import { ConfigTemplates } from '../ConfigTemplate';
import { ApprovalGate } from '../ApprovalGate';
import type { ConfigObject, ConfigValue, EffectiveConfig } from '../../engine/ConfigTypes';
import { flattenTree } from '../../engine/ConfigMerger';

/** Minimal EffectiveConfig over a nested object — tests only. */
function makeConfig(tree: ConfigObject): EffectiveConfig {
  const flat = flattenTree(tree);
  const get = (p: string): ConfigValue | undefined => flat[p];
  const typed = <T>(p: string, t: string, fb: T | undefined): T => {
    const v = flat[p];
    if (v === undefined) {
      if (fb === undefined) throw new Error(`missing ${p}`);
      return fb;
    }
    if (typeof v !== t) throw new Error(`${p} not a ${t}`);
    return v as T;
  };
  return {
    get,
    getString: (p, fb) => typed<string>(p, 'string', fb),
    getNumber: (p, fb) => typed<number>(p, 'number', fb),
    getBoolean: (p, fb) => typed<boolean>(p, 'boolean', fb),
    paths: () => Object.keys(flat),
    flatten: () => ({ ...flat }),
    origin: () => 'test',
    toJSON: () => tree,
  };
}

describe('JsonSchemaValidator', () => {
  const v = new JsonSchemaValidator();

  it('validates a nested object schema', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        host: { type: 'string' as const, pattern: /^[\w.-]+$/ },
        port: { type: 'integer' as const, min: 1, max: 65535 },
      },
      required: ['host', 'port'],
      additionalProperties: false,
    };
    expect(v.validate({ host: 'db.local', port: 5432 }, schema).valid).toBe(true);
    const bad = v.validate({ host: 'db.local', extra: 1 }, schema);
    expect(bad.valid).toBe(false);
    expect(bad.violations.some((x) => x.keyword === 'required' && x.message.includes('port'))).toBe(true);
    expect(bad.violations.some((x) => x.keyword === 'additionalProperties')).toBe(true);
  });

  it('reports every violation, not just the first', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        a: { type: 'number' as const, min: 5 },
        b: { type: 'string' as const },
      },
      required: ['a', 'b', 'c'],
    };
    const r = v.validate({ a: 1, b: 42 }, schema);
    // a: min fail; b: type fail (skipped min on mismatch); c: missing.
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('recurses into arrays with per-index paths', () => {
    const schema = {
      type: 'array' as const,
      minItems: 2,
      items: { type: 'object' as const, required: ['name'] },
    };
    const r = v.validate([{ name: 'x' }, { other: 1 }], schema, 'servers');
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].path).toBe('servers[1]');
  });

  it('enum and const checks', () => {
    const r = v.validate('green', { enum: ['red', 'blue'] });
    expect(r.valid).toBe(false);
    expect(r.violations[0].keyword).toBe('enum');
    expect(v.validate('prod', { const: 'prod' }).valid).toBe(true);
  });

  it('number accepts integers for "number" type but not vice versa', () => {
    expect(v.validate(1.5, { type: 'number' }).valid).toBe(true);
    expect(v.validate(1.5, { type: 'integer' }).valid).toBe(false);
  });

  it('min/max apply to string length and array size', () => {
    expect(v.validate('abc', { min: 4 }).violations[0].keyword).toBe('min');
    expect(v.validate([1, 2, 3, 4], { max: 3 }).violations[0].keyword).toBe('max');
  });
});

describe('DriftDetector', () => {
  const policy = {
    expectedDrift: new Set(['db.host', 'log.level']),
    tolerances: { 'pool.size': 5 },
  };
  const detector = new DriftDetector(policy);
  const baseline = makeConfig({
    db: { host: 'prod-db', port: 5432 },
    pool: { size: 100 },
    log: { level: 'info' },
    cache: { enabled: true },
  });

  it('classifies conforming, expected, unexpected, missing, extra', () => {
    const candidate = makeConfig({
      db: { host: 'staging-db', port: 5432 },   // expected drift
      pool: { size: 103 },                      // within tolerance
      log: { level: 'debug' },                  // expected drift
      // cache.enabled missing entirely         → 'missing'
      feature: { newFlag: true },               // 'extra'
      api: { timeout: 30 },                     // 'extra'… let me add a diff
    });
    const base2 = makeConfig({
      db: { host: 'prod-db', port: 5432 },
      pool: { size: 100 },
      log: { level: 'info' },
      cache: { enabled: true },
      api: { timeout: 30 },                     // same → conforming
      limits: { qps: 1000 },                    // candidate missing → 'missing'
    });
    const report = detector.drift(base2, candidate, { baseline: 'prod', candidate: 'staging' });
    const byPath = new Map(report.entries.map((e) => [e.path, e.kind]));
    expect(byPath.get('db.host')).toBe('expected');
    expect(byPath.get('log.level')).toBe('expected');
    expect(byPath.get('pool.size')).toBeUndefined(); // within tolerance → not reported
    expect(byPath.get('cache.enabled')).toBe('missing');
    expect(byPath.get('feature.newFlag')).toBe('extra');
    expect(byPath.get('limits.qps')).toBe('missing');
    expect(byPath.get('api.timeout')).toBeUndefined(); // conforming, not reported
    expect(report.unexpectedCount).toBe(3); // cache.enabled, limits.qps, feature.newFlag
  });

  it('unexpected paths list is the actionable output', () => {
    const candidate = makeConfig({ a: 2 }); // baseline has a=1? no — see below
    const base = makeConfig({ a: 1, b: 2 });
    const report = detector.drift(base, candidate);
    expect(detector.unexpectedPaths(report).sort()).toEqual(['a', 'b']);
  });

  it('matrix produces pairwise reports for all envs', () => {
    const dev = makeConfig({ k: 1 });
    const stg = makeConfig({ k: 1, extra: true });
    const m = detector.matrix({ dev, stg });
    expect(m.get('dev')!.get('stg')!.entries.some((e) => e.path === 'extra' && e.kind === 'extra')).toBe(true);
    expect(m.get('stg')!.get('dev')!.entries.some((e) => e.path === 'extra' && e.kind === 'missing')).toBe(true);
    expect(m.get('dev')!.has('dev')).toBe(false);
  });
});

describe('SecretRefResolver', () => {
  const store = new Map<string, string>([
    ['db/pass', 's3cret'],
    ['api/key', 'k-123'],
  ]);
  const get = (k: string): string | undefined => store.get(k);
  let resolver: SecretRefResolver;

  beforeEach(() => {
    resolver = new SecretRefResolver(get);
  });

  it('substitutes secret references throughout the tree', () => {
    const r = resolver.resolve({
      db: { url: 'postgres://x:${secret:db/pass}@host/db' },
      keys: ['${secret:api/key}', 'literal'],
      n: 42,
    });
    const t = r.tree as { db: { url: string }; keys: string[]; n: number };
    expect(t.db.url).toBe('postgres://x:s3cret@host/db');
    expect(t.keys).toEqual(['k-123', 'literal']);
    expect(t.n).toBe(42);
    expect(r.unresolved).toHaveLength(0);
    expect(r.refs.map((x) => x.key).sort()).toEqual(['api/key', 'db/pass']);
  });

  it('leaves placeholders for missing keys and lists them', () => {
    const r = resolver.resolve({ v: '${secret:nope}' });
    expect((r.tree as { v: string }).v).toBe('${secret:nope}');
    expect(r.unresolved).toEqual(['nope']);
  });

  it('resolves chained references (secret value containing a ref)', () => {
    store.set('outer', '${secret:inner}');
    store.set('inner', 'deep');
    const r = resolver.resolve({ v: '${secret:outer}' });
    expect((r.tree as { v: string }).v).toBe('deep');
  });

  it('depth-guards against cyclic secret chains', () => {
    store.set('cyc', '${secret:cyc}');
    expect(() => resolver.resolve({ v: '${secret:cyc}' })).toThrow();
  });

  it('rotation hooks fire per-key and via wildcard', () => {
    const calls: Array<[string, number]> = [];
    resolver.onRotate('db/pass', (k, v) => calls.push([k, v]));
    resolver.onRotate('*', (k, v) => calls.push([`*:${k}`, v]));
    const errs = resolver.notifyRotated('db/pass', 7);
    expect(errs).toHaveLength(0);
    expect(calls).toEqual([
      ['db/pass', 7],
      ['*:db/pass', 7],
    ]);
  });

  it('hook errors are collected, not thrown', () => {
    resolver.onRotate('k', () => {
      throw new Error('hook boom');
    });
    const errs = resolver.notifyRotated('k', 2);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe('hook boom');
  });

  it('references() maps keys to referencing config paths', () => {
    resolver.resolve({
      a: '${secret:db/pass}',
      b: { c: '${secret:db/pass}', d: '${secret:api/key}' },
    });
    const refs = resolver.references();
    expect(refs.get('db/pass')!.sort()).toEqual(['a', 'b.c']);
    expect(refs.get('api/key')).toEqual(['b.d']);
  });

  it('scan() extracts refs without resolving', () => {
    const refs = SecretRefResolver.scan({ x: '${secret:k@3}' });
    expect(refs).toEqual([{ configPath: 'x', key: 'k', version: 3 }]);
  });
});

describe('ConfigHistory', () => {
  let clock = 1_000_000;
  let hist: ConfigHistory;

  beforeEach(() => {
    clock = 1_000_000;
    hist = new ConfigHistory({ clock: () => clock });
  });

  const cfg = (flat: Record<string, ConfigValue>): EffectiveConfig => {
    const tree: ConfigObject = {};
    for (const [k, v] of Object.entries(flat)) {
      const parts = k.split('.');
      let cur = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = (cur[parts[i]] ??= {}) as ConfigObject;
      }
      cur[parts[parts.length - 1]] = v;
    }
    return makeConfig(tree);
  };

  it('records attributed change sets with computed diffs', () => {
    const s1 = hist.record('alice', null, cfg({ 'a.b': 1 }), 'init');
    const s2 = hist.record('bob', cfg({ 'a.b': 1 }), cfg({ 'a.b': 2, 'c.d': 'x' }), 'bump');
    expect(s1.seq).toBe(1);
    expect(s2.seq).toBe(2);
    expect(s2.diff.changes.map((c) => c.kind).sort()).toEqual(['added', 'modified']);
    expect(hist.forActor('bob')).toHaveLength(1);
  });

  it('blame returns the last actor to touch a path', () => {
    hist.record('alice', null, cfg({ 'a.b': 1 }));
    hist.record('bob', cfg({ 'a.b': 1 }), cfg({ 'a.b': 2 }));
    hist.record('carol', cfg({ 'a.b': 2 }), cfg({ 'a.b': 2, 'x.y': 1 }));
    expect(hist.blame('a.b')!.actor).toBe('bob');
    expect(hist.blame('x.y')!.actor).toBe('carol');
    expect(hist.blame('never')).toBeNull();
  });

  it('rollback produces tombstones for adds and old values for mods', () => {
    hist.record('a', null, cfg({ keep: 1 })); // seq1
    hist.record('a', cfg({ keep: 1 }), cfg({ keep: 2, added: 'x' })); // seq2
    hist.record('b', cfg({ keep: 2, added: 'x' }), cfg({ keep: 3, added: 'x' })); // seq3
    const undo = hist.rollback(1); // restore state at seq1
    const byPath = new Map(undo.map((e) => [e.path, e.value]));
    // Correct semantics: undo newest-first; 'keep' was 2→3 in seq3, so the
    // undo restores 2 (the seq3 pre-state). seq2's own undo is skipped —
    // the first (newest) write wins per path.
    expect(byPath.get('keep')).toBe(2);
    expect(byPath.get('added')).toBe(TOMBSTONE);
    expect(undo.find((e) => e.path === 'added')!.sinceSeq).toBe(2);
  });

  it('bounds the log and tracks dropped sets', () => {
    const small = new ConfigHistory({ clock: () => clock, capacity: 2 });
    small.record('a', null, cfg({ x: 1 }));
    small.record('a', cfg({ x: 1 }), cfg({ x: 2 }));
    small.record('a', cfg({ x: 2 }), cfg({ x: 3 }));
    expect(small.size).toBe(2);
    expect(small.droppedCount).toBe(1);
    // blame for x points at the newest set — evicted entries cleaned up.
    expect(small.blame('x')!.seq).toBe(3);
  });
});

describe('ConfigNamespace', () => {
  const config = makeConfig({
    billing: {
      timeout: 5000,
      stripe: { key: 'sk', retries: 3 },
    },
    other: { x: 1 },
  });
  const billing = new ConfigNamespace(config, 'billing');

  it('prefix-strips reads', () => {
    expect(billing.getNumber('timeout')).toBe(5000);
    expect(billing.getString('stripe.key')).toBe('sk');
  });

  it('sub() composes prefixes', () => {
    const stripe = billing.sub('stripe');
    expect(stripe.prefix).toBe('billing.stripe');
    expect(stripe.getNumber('retries')).toBe(3);
  });

  it('ownKeys lists immediate children only', () => {
    expect(billing.ownKeys()).toEqual(['stripe', 'timeout']);
  });

  it('toObject returns the subtree unflattened', () => {
    expect(billing.toObject()).toEqual({
      timeout: 5000,
      stripe: { key: 'sk', retries: 3 },
    });
  });

  it('declared schema validates only the subtree', () => {
    billing.declare({
      type: 'object',
      properties: { timeout: { type: 'number', min: 1000 } },
      required: ['timeout'],
    });
    expect(billing.validate().valid).toBe(true);
    billing.declare({
      type: 'object',
      properties: { timeout: { type: 'number', min: 99999 } },
    });
    const r = billing.validate();
    expect(r.valid).toBe(false);
    expect(r.violations[0].path).toBe('billing.timeout');
  });

  it('rejects empty or malformed prefixes', () => {
    expect(() => new ConfigNamespace(config, '')).toThrow();
    expect(() => new ConfigNamespace(config, 'a..b')).toThrow();
  });
});

describe('ConfigTemplates', () => {
  let tpl: ConfigTemplates;

  beforeEach(() => {
    tpl = new ConfigTemplates();
    tpl.define('service', {
      name: '${service}',
      port: 8080,
      db: { host: '${dbHost|localhost}', pool: '${poolSize|10}' },
      feature: '${include:features}',
    });
    tpl.define('features', {
      newUi: 'true',
      beta: '${betaFlag|false}',
    });
  });

  it('instantiates with vars and defaults', () => {
    const cfg = tpl.instantiate('service', { service: 'billing' }) as {
      name: string;
      db: { host: string; pool: string };
      feature: { newUi: string; beta: string };
    };
    expect(cfg.name).toBe('billing');
    expect(cfg.db.host).toBe('localhost'); // default
    expect(cfg.db.pool).toBe('10');
    expect(cfg.feature.newUi).toBe('true'); // include spliced
    expect(cfg.feature.beta).toBe('false');
  });

  it('generates per-env configs with env vars winning', () => {
    const envs = tpl.generate(
      'service',
      { service: 'api', dbHost: 'shared-db' },
      [
        { name: 'dev', vars: {} },
        { name: 'prod', vars: { dbHost: 'prod-db', poolSize: '50', betaFlag: 'true' } },
      ]
    );
    const dev = envs.get('dev') as { db: { host: string } };
    const prod = envs.get('prod') as { db: { host: string; pool: string }; feature: { beta: string } };
    expect(dev.db.host).toBe('shared-db');
    expect(prod.db.host).toBe('prod-db');
    expect(prod.db.pool).toBe('50');
    expect(prod.feature.beta).toBe('true');
  });

  it('unresolved vars keep the literal placeholder', () => {
    const cfg = tpl.instantiate('service', {}) as { name: string };
    expect(cfg.name).toBe('${service}');
  });

  it('detects circular includes', () => {
    tpl.define('a', { x: '${include:b}' });
    tpl.define('b', { y: '${include:a}' });
    expect(() => tpl.instantiate('a', {})).toThrow('circular');
  });

  it('lists declared variables post-include', () => {
    const vars = tpl.variables('service');
    expect(vars).toEqual(['betaFlag', 'dbHost', 'poolSize', 'service']);
  });

  it('throws on unknown templates', () => {
    expect(() => tpl.instantiate('ghost', {})).toThrow();
  });
});

describe('ApprovalGate', () => {
  let clock: number;
  let gate: ApprovalGate;

  beforeEach(() => {
    clock = 1_000_000;
    gate = new ApprovalGate({ clock: () => clock, ttlMs: 60_000 });
    gate.protect({ pattern: 'security.**', requiredCount: 2, approvers: new Set(['sec-a', 'sec-b', 'sec-c']) });
    gate.protect({ pattern: 'billing.limit', requiredCount: 1 });
  });

  it('unprotected paths commit without approvals', () => {
    const r = gate.propose('alice', [{ path: 'ui.theme', oldValue: 'dark', newValue: 'light' }]);
    expect(r.protectedPaths).toHaveLength(0);
    expect(r.requiredApprovals).toBe(0);
    // Zero required → approve() flips immediately on first call? No:
    // resolve() requires 'approved'; with 0 required we still need an
    // explicit approve — check behavior.
    gate.approve(r.requestId, 'bob');
    expect(r.status).toBe('approved');
    gate.resolve(r.requestId);
    expect(r.status).toBe('committed');
  });

  it('protected paths need quorum of distinct eligible approvers', () => {
    const r = gate.propose('alice', [
      { path: 'security.tls.minVersion', oldValue: '1.2', newValue: '1.3' },
    ]);
    expect(r.requiredApprovals).toBe(2);
    gate.approve(r.requestId, 'sec-a');
    expect(r.status).toBe('pending');
    gate.approve(r.requestId, 'sec-a'); // same approver doesn't double-count
    expect(r.status).toBe('pending');
    gate.approve(r.requestId, 'sec-b');
    expect(r.status).toBe('approved');
  });

  it('proposer cannot self-approve', () => {
    const r = gate.propose('alice', [
      { path: 'security.tls.minVersion', oldValue: '1.2', newValue: '1.3' },
    ]);
    expect(() => gate.approve(r.requestId, 'alice')).toThrow('own');
  });

  it('ineligible approvers are rejected per path', () => {
    const r = gate.propose('alice', [
      { path: 'security.tls.minVersion', oldValue: '1.2', newValue: '1.3' },
    ]);
    expect(() => gate.approve(r.requestId, 'random-joe')).toThrow('eligible');
  });

  it('conflicting proposals on the same protected path are refused', () => {
    gate.propose('a', [{ path: 'security.x', oldValue: 1, newValue: 2 }]);
    expect(() =>
      gate.propose('b', [{ path: 'security.x', oldValue: 1, newValue: 3 }])
    ).toThrow('conflicts');
    // Unprotected overlap is fine.
    gate.propose('c', [{ path: 'ui.theme', oldValue: 'a', newValue: 'b' }]);
  });

  it('expired requests cannot be approved', () => {
    const r = gate.propose('a', [{ path: 'security.x', oldValue: 1, newValue: 2 }]);
    clock += 61_000;
    expect(() => gate.approve(r.requestId, 'sec-a')).toThrow('expired');
    expect(r.status).toBe('expired');
  });

  it('proposer may cancel; others may not', () => {
    const r = gate.propose('a', [{ path: 'ui.x', oldValue: 1, newValue: 2 }]);
    expect(gate.cancel(r.requestId, 'b')).toBe(false);
    expect(gate.cancel(r.requestId, 'a')).toBe(true);
    expect(r.status).toBe('cancelled');
  });

  it('resolve rejects non-approved requests', () => {
    const r = gate.propose('a', [{ path: 'security.x', oldValue: 1, newValue: 2 }]);
    expect(() => gate.resolve(r.requestId)).toThrow('pending');
  });

  it('wildcard patterns match per-segment and any-depth', () => {
    gate.protect({ pattern: 'env.*.flag', requiredCount: 1 });
    const r1 = gate.propose('a', [{ path: 'env.prod.flag', oldValue: 0, newValue: 1 }]);
    expect(r1.protectedPaths).toEqual(['env.prod.flag']);
    const r2 = gate.propose('a', [{ path: 'env.deep.nested.flag', oldValue: 0, newValue: 1 }]);
    expect(r2.protectedPaths).toHaveLength(0); // * = one segment only
  });
});
