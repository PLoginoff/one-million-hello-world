/**
 * Feature registry tests — versioning, lifecycle, validation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { FeatureRegistry, FeatureRegistryError } from '../../engine';

const age = { name: 'age', type: 'int' as const, owner: 'growth', ttlMs: 60_000 };

describe('FeatureRegistry', () => {
  let clock: ManualClock;
  let reg: FeatureRegistry;

  beforeEach(() => {
    clock = new ManualClock(0);
    reg = new FeatureRegistry(clock);
  });

  it('registers a feature as v1 active', () => {
    const f = reg.register(age);
    expect(f.version).toBe(1);
    expect(f.lifecycle).toBe('active');
  });

  it('re-registering identical def is a no-op', () => {
    reg.register(age);
    expect(reg.register(age).version).toBe(1);
  });

  it('schema change bumps version and records history', () => {
    reg.register(age);
    const v2 = reg.register({ ...age, ttlMs: 120_000 });
    expect(v2.version).toBe(2);
    expect(reg.history('age').length).toBe(1);
    expect(reg.history('age')[0].ttlMs).toBe(60_000);
  });

  it('deprecate → still served; retire → removed', () => {
    reg.register(age);
    reg.deprecate('age');
    expect(reg.status('age')).toBe('deprecated');
    reg.retire('age');
    expect(reg.status('age')).toBe('retired');
    expect(reg.get('age')).toBeUndefined();
  });

  it('retire on unknown feature throws', () => {
    expect(() => reg.retire('nope')).toThrow(FeatureRegistryError);
  });

  it('validateSet catches type mismatches and unregistered features', () => {
    reg.register(age);
    reg.register({ name: 'score', type: 'float', owner: 'growth', ttlMs: 0 });
    const errors = reg.validateSet({ age: 'thirty', score: 0.5, unknown: 1 });
    expect(errors.length).toBe(2);
    expect(errors.find((e) => e.feature === 'age')?.error).toContain('type mismatch');
    expect(errors.find((e) => e.feature === 'unknown')?.error).toContain('unregistered');
  });

  it('catalog and byOwner list features', () => {
    reg.register(age);
    reg.register({ name: 'zeta', type: 'string', owner: 'ml', ttlMs: 0 });
    expect(reg.catalog().map((f) => f.name)).toEqual(['age', 'zeta']);
    expect(reg.byOwner('growth').length).toBe(1);
  });
});
