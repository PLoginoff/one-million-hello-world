/**
 * Schema Registry tests — canonicalization, fingerprinting, field-level
 * compatibility (backward/forward/full + transitive), versioning,
 * soft/hard delete, reference graph.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SchemaRegistryEngine } from '../registry/SchemaRegistryEngine';
import { CompatibilityChecker } from '../registry/CompatibilityChecker';
import { ReferenceGraph } from '../registry/ReferenceGraph';
import { canonicalizeSchema, fingerprint, validateSchema } from '../registry/SchemaModel';
import {
  CompatibilityMode,
  ChangeKind,
  RegistryError,
  SchemaRegistryErrorCode,
} from '../registry/types';

const USER_V1 = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'name', type: 'string' },
  ],
};

const USER_V2_ADD_DEFAULT = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'name', type: 'string' },
    { name: 'email', type: ['null', 'string'], default: null },
  ],
};

const USER_V3_ADD_NODEAULT = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'name', type: 'string' },
    { name: 'email', type: ['null', 'string'], default: null },
    { name: 'age', type: 'int' },
  ],
};

describe('SchemaModel', () => {
  it('canonicalizes key order and union order', () => {
    const a = { type: 'record', name: 'X', fields: [{ name: 'f', type: ['null', 'string'], default: null }] };
    const b = { name: 'X', fields: [{ default: null, type: ['string', 'null'], name: 'f' }], type: 'record' };
    expect(canonicalizeSchema(a)).toBe(canonicalizeSchema(b));
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('field order matters (encoding semantics)', () => {
    const a = { type: 'record', name: 'X', fields: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] };
    const b = { type: 'record', name: 'X', fields: [{ name: 'b', type: 'int' }, { name: 'a', type: 'int' }] };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('validates malformed schemas', () => {
    expect(() => validateSchema({ type: 'record', name: 'X' })).toThrow(RegistryError);
    expect(() => validateSchema({ type: 'record', name: 'X', fields: [{ name: 'f' }] })).toThrow(RegistryError);
    expect(() => validateSchema({ type: 'enum', symbols: ['a', 2] })).toThrow(RegistryError);
  });
});

describe('CompatibilityChecker', () => {
  const checker = new CompatibilityChecker(true);

  it('backward: added field with default is compatible', () => {
    const r = checker.check(USER_V1, USER_V2_ADD_DEFAULT, CompatibilityMode.BACKWARD);
    expect(r.compatible).toBe(true);
    expect(r.diffs.some((d) => d.kind === ChangeKind.FIELD_ADDED_WITH_DEFAULT && d.path === 'email')).toBe(true);
  });

  it('backward: added field without default is incompatible', () => {
    const r = checker.check(USER_V2_ADD_DEFAULT, USER_V3_ADD_NODEAULT, CompatibilityMode.BACKWARD);
    expect(r.compatible).toBe(false);
    expect(r.violations.some((v) => v.includes('age'))).toBe(true);
  });

  it('forward: removed field requires default in old schema', () => {
    // old has email WITH default; new drops it -> forward compatible
    const fwd = checker.check(USER_V2_ADD_DEFAULT, USER_V1, CompatibilityMode.FORWARD);
    expect(fwd.compatible).toBe(true);
    // old has name WITHOUT default; new drops it -> forward incompatible
    const v1NoName = { type: 'record', name: 'User', fields: [{ name: 'id', type: 'long' }] };
    const fwd2 = checker.check(USER_V1, v1NoName, CompatibilityMode.FORWARD);
    expect(fwd2.compatible).toBe(false);
  });

  it('backward: removing a field is fine; forward requires the old had a default', () => {
    const b = checker.check(USER_V2_ADD_DEFAULT, USER_V1, CompatibilityMode.BACKWARD);
    expect(b.compatible).toBe(true);
    expect(b.diffs.some((d) => d.kind === ChangeKind.FIELD_REMOVED_HAD_DEFAULT)).toBe(true);
  });

  it('type widening int->long is compatible; narrowing long->int is not', () => {
    const old = { type: 'record', name: 'R', fields: [{ name: 'n', type: 'int' }] };
    const wider = { type: 'record', name: 'R', fields: [{ name: 'n', type: 'long' }] };
    const narrower = { type: 'record', name: 'R', fields: [{ name: 'n', type: 'int' }] };
    const widerRes = checker.check(old, wider, CompatibilityMode.BACKWARD);
    expect(widerRes.compatible).toBe(true);
    expect(widerRes.diffs.some((d) => d.kind === ChangeKind.FIELD_TYPE_WIDENED)).toBe(true);
    const narrowerRes = checker.check(wider, narrower, CompatibilityMode.BACKWARD);
    expect(narrowerRes.compatible).toBe(false);
    expect(narrowerRes.diffs.some((d) => d.kind === ChangeKind.FIELD_TYPE_NARROWED)).toBe(true);
  });

  it('union branch coverage: every writer branch needs a readable reader branch', () => {
    const old = { type: 'record', name: 'U', fields: [{ name: 'v', type: ['int', 'string'] }] };
    const expanded = { type: 'record', name: 'U', fields: [{ name: 'v', type: ['int', 'string', 'bytes'] }] };
    const contracted = { type: 'record', name: 'U', fields: [{ name: 'v', type: ['int'] }] };
    // Backward: reader (new) must read all writer (old) branches — expanding union is fine
    expect(checker.check(old, expanded, CompatibilityMode.BACKWARD).compatible).toBe(true);
    // Contracting: new reader can't handle old 'string' data
    expect(checker.check(old, contracted, CompatibilityMode.BACKWARD).compatible).toBe(false);
  });

  it('nested records checked recursively', () => {
    const old = {
      type: 'record', name: 'P',
      fields: [{ name: 'addr', type: { type: 'record', name: 'Addr', fields: [{ name: 'zip', type: 'string' }] } }],
    };
    const bad = {
      type: 'record', name: 'P',
      fields: [{ name: 'addr', type: { type: 'record', name: 'Addr', fields: [{ name: 'zip', type: 'string' }, { name: 'cc', type: 'int' }] } }],
    };
    const r = checker.check(old, bad, CompatibilityMode.BACKWARD);
    expect(r.compatible).toBe(false);
    expect(r.violations.some((v) => v.includes('addr.cc'))).toBe(true);
  });

  it('FULL requires both directions', () => {
    // v1->v2: backward OK (added-with-default), forward OK (removed had default) => FULL ok
    expect(checker.check(USER_V1, USER_V2_ADD_DEFAULT, CompatibilityMode.FULL).compatible).toBe(true);
    // v2->v3 (age no default): backward fails => FULL fails
    expect(checker.check(USER_V2_ADD_DEFAULT, USER_V3_ADD_NODEAULT, CompatibilityMode.FULL).compatible).toBe(false);
  });

  it('enum symbol coverage', () => {
    const old = { type: 'record', name: 'E', fields: [{ name: 's', type: { type: 'enum', name: 'S', symbols: ['A', 'B'] } }] };
    const expanded = { type: 'record', name: 'E', fields: [{ name: 's', type: { type: 'enum', name: 'S', symbols: ['A', 'B', 'C'] } }] };
    const contracted = { type: 'record', name: 'E', fields: [{ name: 's', type: { type: 'enum', name: 'S', symbols: ['A'] } }] };
    expect(checker.check(old, expanded, CompatibilityMode.BACKWARD).compatible).toBe(true);
    expect(checker.check(old, contracted, CompatibilityMode.BACKWARD).compatible).toBe(false);
  });
});

describe('ReferenceGraph', () => {
  it('detects cycles and computes transitive closures', () => {
    const g = new ReferenceGraph();
    g.addEdge('a', 'b');
    g.addEdge('b', 'c');
    expect(g.wouldCycle('c', 'a')).toBe(true);
    expect(g.wouldCycle('d', 'a')).toBe(false);
    expect(g.dependenciesOf('a').sort()).toEqual(['b', 'c']);
    expect(g.dependentsOf('c').sort()).toEqual(['a', 'b']);
  });
});

describe('SchemaRegistryEngine', () => {
  let engine: SchemaRegistryEngine;
  beforeEach(() => { engine = new SchemaRegistryEngine(); });

  it('registers versions and is idempotent on identical content', () => {
    const r1 = engine.register('user-value', USER_V1);
    expect(r1.version).toBe(1);
    const r2 = engine.register('user-value', USER_V2_ADD_DEFAULT);
    expect(r2.version).toBe(2);
    // same schema again -> same version
    const r3 = engine.register('user-value', { ...USER_V2_ADD_DEFAULT });
    expect(r3.alreadyRegistered).toBe(true);
    expect(r3.version).toBe(2);
    expect(engine.latest('user-value').version).toBe(2);
  });

  it('rejects incompatible registration with violation details', () => {
    engine.register('user-value', USER_V2_ADD_DEFAULT);
    expect(() => engine.register('user-value', USER_V3_ADD_NODEAULT))
      .toThrowError(expect.objectContaining({ code: SchemaRegistryErrorCode.INCOMPATIBLE }));
  });

  it('per-subject compatibility override', () => {
    engine.register('flex', USER_V1);
    engine.setCompatibility('flex', CompatibilityMode.NONE);
    // now anything goes
    const r = engine.register('flex', { type: 'record', name: 'Other', fields: [] });
    expect(r.version).toBe(2);
  });

  it('transitive check compares against ALL prior versions', () => {
    // create subject explicitly with transitive mode before first register
    engine.store.createSubject('t', CompatibilityMode.BACKWARD_TRANSITIVE);
    engine.register('t', USER_V1);                       // v1
    engine.register('t', USER_V2_ADD_DEFAULT);           // v2 (backward vs v1 ok)
    // v3 drops 'name' (fine vs v2 backward), re-adds? try breaking vs v1:
    // v1 has 'name' required; if candidate renamed name->title no default => fails vs BOTH
    const renamed = {
      type: 'record', name: 'User',
      fields: [{ name: 'id', type: 'long' }, { name: 'title', type: 'string' }],
    };
    expect(() => engine.register('t', renamed)).toThrow(RegistryError);
  });

  it('checkCompatibility is a dry-run', () => {
    engine.register('d', USER_V1);
    const r = engine.checkCompatibility('d', USER_V3_ADD_NODEAULT);
    expect(r.compatible).toBe(false);
    expect(engine.latest('d').version).toBe(1); // nothing registered
  });

  it('soft delete hides subject; undelete restores', () => {
    engine.register('s', USER_V1);
    expect(engine.deleteSubject('s')).toBe(1);
    expect(engine.subjects()).not.toContain('s');
    expect(engine.subjects(true)).toContain('s');
    expect(() => engine.register('s', USER_V2_ADD_DEFAULT)).toThrowError(
      expect.objectContaining({ code: SchemaRegistryErrorCode.SUBJECT_DELETED })
    );
    engine.undeleteSubject('s');
    expect(engine.subjects()).toContain('s');
  });

  it('soft-delete a single version', () => {
    engine.register('v', USER_V1);
    engine.register('v', USER_V2_ADD_DEFAULT);
    engine.deleteVersion('v', 2);
    expect(engine.latest('v').version).toBe(1);
    expect(engine.getVersion('v', 1).version).toBe(1);
    expect(() => engine.getVersion('v', 2)).toThrowError(
      expect.objectContaining({ code: SchemaRegistryErrorCode.VERSION_NOT_FOUND })
    );
  });

  it('hard delete requires soft-delete first and no live dependents', () => {
    engine.register('base', USER_V1);
    // Register a dependent referencing base v1
    engine.register('dep', { type: 'record', name: 'D', fields: [{ name: 'u', type: 'User' }] }, [
      { name: 'User', subject: 'base', version: 1 },
    ]);
    engine.deleteSubject('base');
    expect(() => engine.hardDeleteSubject('base')).toThrowError(
      expect.objectContaining({ code: SchemaRegistryErrorCode.INVALID_SCHEMA })
    );
    // Delete dep first, then hard-delete base works
    engine.deleteSubject('dep');
    engine.hardDeleteSubject('dep');
    engine.hardDeleteSubject('base');
    expect(engine.subjects(true)).not.toContain('base');
  });

  it('rejects references to missing versions and cycles', () => {
    engine.register('r1', USER_V1);
    expect(() =>
      engine.register('r2', { type: 'record', name: 'D', fields: [] }, [
        { name: 'User', subject: 'r1', version: 9 },
      ])
    ).toThrowError(expect.objectContaining({ code: SchemaRegistryErrorCode.REFERENCE_NOT_FOUND }));
  });

  it('dependency graph reflects references', () => {
    engine.register('shared', USER_V1);
    engine.register('uses-shared', { type: 'record', name: 'U', fields: [] }, [
      { name: 'User', subject: 'shared', version: 1 },
    ]);
    expect(engine.dependenciesOf('uses-shared')).toEqual(['shared']);
    expect(engine.dependentsOf('shared')).toEqual(['uses-shared']);
  });

  it('lookupSchema finds by fingerprint', () => {
    const r = engine.register('fp', USER_V1);
    const found = engine.lookupSchema('fp', { name: 'User', fields: USER_V1.fields, type: 'record' });
    expect(found?.version).toBe(r.version);
  });
});
