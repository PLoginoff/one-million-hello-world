/**
 * Registry extra tests — DataValidator, MigrationPlanner, edge cases.
 */

import { describe, it, expect } from 'bun:test';
import { DataValidator } from '../registry/DataValidator';
import { MigrationPlanner, MigrationOp } from '../registry/MigrationPlanner';
import { SchemaRegistryEngine } from '../registry/SchemaRegistryEngine';
import { CompatibilityMode, ChangeKind } from '../registry/types';
import { CompatibilityChecker } from '../registry/CompatibilityChecker';

const USER = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'name', type: 'string' },
    { name: 'tags', type: { type: 'array', items: 'string' } },
    { name: 'prefs', type: { type: 'map', values: 'string' }, default: {} },
    { name: 'state', type: { type: 'enum', name: 'St', symbols: ['ON', 'OFF'] }, default: 'ON' },
  ],
};

describe('DataValidator', () => {
  const v = new DataValidator();

  it('validates a conforming document', () => {
    const issues = v.validate(USER, {
      id: 42, name: 'a', tags: ['x', 'y'], prefs: { k: 'v' }, state: 'ON',
    });
    expect(issues).toEqual([]);
  });

  it('reports missing required fields and type mismatches with paths', () => {
    const issues = v.validate(USER, { id: 'not-a-num', tags: ['ok', 5], state: 'BAD' });
    expect(issues.some((i) => i.path === '$.name' && i.actual === 'absent')).toBe(true);
    expect(issues.some((i) => i.path === '$.id' && i.expected === 'long')).toBe(true);
    expect(issues.some((i) => i.path === '$.tags[1]')).toBe(true);
    expect(issues.some((i) => i.path === '$.state')).toBe(true);
  });

  it('int bounds and long safe-integer range enforced', () => {
    const s = { type: 'record', name: 'N', fields: [{ name: 'a', type: 'int' }, { name: 'b', type: 'long' }] };
    expect(v.validate(s, { a: 3_000_000_000, b: 1 }).some((i) => i.path === '$.a')).toBe(true);
    expect(v.validate(s, { a: 1, b: Number.MAX_SAFE_INTEGER + 1 }).some((i) => i.path === '$.b')).toBe(true);
  });

  it('union validation: any branch match is enough', () => {
    const s = { type: 'record', name: 'U', fields: [{ name: 'v', type: ['null', 'string', 'int'] }] };
    expect(v.validate(s, { v: 'x' })).toEqual([]);
    expect(v.validate(s, { v: 3 })).toEqual([]);
    expect(v.validate(s, { v: null })).toEqual([]);
    expect(v.validate(s, { v: 1.5 })).toHaveLength(1);
  });
});

describe('MigrationPlanner', () => {
  const planner = new MigrationPlanner();

  it('lossless additive plan', () => {
    const old = { type: 'record', name: 'R', fields: [{ name: 'a', type: 'int' }] };
    const next = { type: 'record', name: 'R', fields: [{ name: 'a', type: 'long' }, { name: 'b', type: 'string', default: '' }] };
    const plan = planner.plan(old, next);
    expect(plan.lossless).toBe(true);
    expect(plan.steps.some((s) => s.op === MigrationOp.WIDEN_FIELD)).toBe(true);
    expect(plan.steps.some((s) => s.op === MigrationOp.ADD_FIELD)).toBe(true);
    expect(plan.fieldsTouched).toBe(2);
  });

  it('lossy plan when fields dropped or narrowed', () => {
    const old = { type: 'record', name: 'R', fields: [{ name: 'a', type: 'long' }, { name: 'dead', type: 'string' }] };
    const next = { type: 'record', name: 'R', fields: [{ name: 'a', type: 'int' }] };
    const plan = planner.plan(old, next);
    expect(plan.lossless).toBe(false);
    expect(plan.steps.some((s) => s.op === MigrationOp.DROP_FIELD && s.lossy)).toBe(true);
    expect(plan.steps.some((s) => s.op === MigrationOp.NARROW_FIELD && s.lossy)).toBe(true);
  });
});

describe('Registry engine — edge cases', () => {
  it('getById global id fetch + version numbering survives deletes', () => {
    const e = new SchemaRegistryEngine();
    const r1 = e.register('s', { type: 'record', name: 'A', fields: [] });
    const r2 = e.register('s', { type: 'record', name: 'A', fields: [{ name: 'x', type: 'int', default: 0 }] });
    e.deleteVersion('s', 1);
    const r3 = e.register('s', { type: 'record', name: 'A', fields: [{ name: 'x', type: 'int', default: 0 }, { name: 'y', type: 'string', default: '' }] });
    expect(r3.version).toBe(3); // versions never reuse numbers
    expect(e.getById(r2.id).version).toBe(2);
    void r1;
  });

  it('FORWARD_TRANSITIVE: new schema must be readable by ALL old versions', () => {
    const e = new SchemaRegistryEngine();
    e.store.createSubject('ft', CompatibilityMode.FORWARD_TRANSITIVE);
    e.register('ft', { type: 'record', name: 'A', fields: [{ name: 'keep', type: 'string' }] });
    // v2 adds a field with default — old readers must tolerate NEW writes:
    // v1 reader sees unknown 'extra' field: fine, forward skips unknowns.
    e.register('ft', { type: 'record', name: 'A', fields: [{ name: 'keep', type: 'string' }, { name: 'extra', type: 'int', default: 0 }] });
    // v3 drops 'keep' — v1 has no default for 'keep' => forward-incompatible vs v1
    const drop = { type: 'record', name: 'A', fields: [{ name: 'extra', type: 'int', default: 0 }] };
    expect(() => e.register('ft', drop)).toThrow();
  });

  it('diff reports renames as add+remove', () => {
    const checker = new CompatibilityChecker();
    const report = checker.diff(
      { type: 'record', name: 'A', fields: [{ name: 'old', type: 'string' }] },
      { type: 'record', name: 'A', fields: [{ name: 'new', type: 'string' }] }
    );
    const kinds = report.map((d) => d.kind);
    expect(kinds).toContain(ChangeKind.FIELD_REMOVED);
    expect(kinds).toContain(ChangeKind.FIELD_ADDED);
  });
});
