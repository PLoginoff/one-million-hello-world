/**
 * engine2 FeatureSetComposer tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { FeatureDefinition, FeatureView } from '../../engine/FeatureStore';
import { FeatureSetComposer } from '../../engine2';

function def(name: string, type: FeatureDefinition['type']): FeatureDefinition {
  return { name, type, owner: 'team', ttlMs: 0 };
}

function view(name: string, features: FeatureDefinition[]): FeatureView {
  return { name, entity: 'user', features };
}

describe('FeatureSetComposer', () => {
  let c: FeatureSetComposer;

  beforeEach(() => {
    c = new FeatureSetComposer(() => 1_000);
    c.registerView(view('base', [def('age', 'int'), def('country', 'string')]));
    c.registerView(view('extra', [def('ctr', 'float'), def('tags', 'vector')]));
  });

  it('composes a flat feature map from views', () => {
    const s = c.compose('set', ['base', 'extra']);
    expect(Object.keys(s.features).sort()).toEqual(['age', 'country', 'ctr', 'tags']);
    expect(s.version).toBe(1);
    expect(s.sourceViews).toEqual(['base', 'extra']);
  });

  it('auto-increments versions per set name', () => {
    c.compose('set', ['base']);
    const v2 = c.compose('set', ['base', 'extra']);
    expect(v2.version).toBe(2);
    expect(c.get('set')!.version).toBe(2);
    expect(c.get('set', 1)!.version).toBe(1);
  });

  it('fingerprint is stable for identical schemas', () => {
    const a = c.compose('a', ['base']);
    const b = c.compose('b', ['base']);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('compatible when candidate only adds features', () => {
    const v1 = c.compose('set', ['base']);
    const v2 = c.compose('set', ['base', 'extra']);
    const r = c.checkCompatibility(v1, v2);
    expect(r.verdict).toBe('compatible');
    expect(r.added.sort()).toEqual(['ctr', 'tags']);
    expect(r.removed).toEqual([]);
  });

  it('breaking when a feature is removed or type-changed', () => {
    const v1 = c.compose('set', ['base', 'extra']);
    const v2 = c.compose('set', ['extra']);
    const r = c.checkCompatibility(v1, v2);
    expect(r.verdict).toBe('breaking');
    expect(r.removed.sort()).toEqual(['age', 'country']);
  });

  it('breaking on type change', () => {
    c.registerView(view('v2', [def('age', 'float')]));
    const v1 = c.compose('set', ['base']);
    const v2 = c.compose('set', ['v2']);
    const r = c.checkCompatibility(v1, v2);
    expect(r.verdict).toBe('breaking');
    expect(r.typeChanged).toEqual(['age']);
  });

  it('identical fingerprints short-circuit to identical', () => {
    const v1 = c.compose('set', ['base']);
    const v1b = c.get('set', 1)!;
    expect(c.checkCompatibility(v1, v1b).verdict).toBe('identical');
  });

  it('describe lists the schema sorted', () => {
    const s = c.compose('set', ['base', 'extra']);
    expect(c.describe(s)).toEqual([
      'age: int', 'country: string', 'ctr: float', 'tags: vector',
    ]);
  });
});
