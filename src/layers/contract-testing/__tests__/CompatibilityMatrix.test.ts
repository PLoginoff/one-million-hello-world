/**
 * Compatibility analysis engine tests.
 */

import { describe, it, expect } from 'bun:test';
import { ContractBuilder } from '../engine/ContractRegistry';
import type { Contract } from '../engine/ContractRegistry';
import {
  ContractCompatibilityAnalyzer,
  CompatibilityMatrix,
  inferShape,
} from '../engine/CompatibilityMatrix';

function baseContract(version: string): Contract {
  return new ContractBuilder('web', 'api')
    .version(version)
    .interaction({
      id: 'i1',
      description: 'get user',
      request: { method: 'GET', path: '/users/1' },
      response: {
        status: 200,
        body: { id: 1, name: 'a', meta: { age: 30 } },
      },
    })
    .build();
}

describe('inferShape', () => {
  it('infers nested object and array shapes', () => {
    const shape = inferShape({ a: [1, 2], b: { c: 'x' }, d: null });
    expect(shape.type).toBe('object');
    expect(shape.children.get('a')?.type).toBe('array');
    expect(shape.children.get('a')?.element?.type).toBe('number');
    expect(shape.children.get('b')?.children.get('c')?.type).toBe('string');
    expect(shape.children.get('d')?.type).toBe('null');
  });
});

describe('ContractCompatibilityAnalyzer', () => {
  const analyzer = new ContractCompatibilityAnalyzer();

  it('reports identical contracts as compatible', () => {
    const report = analyzer.analyze(baseContract('1.0.0'), baseContract('1.0.1'));
    expect(report.backwardCompatible).toBe(true);
    expect(report.suggestedBump).toBe('patch');
  });

  it('detects interaction removal as breaking', () => {
    const v1 = new ContractBuilder('web', 'api')
      .version('1.0.0')
      .interaction({
        id: 'i1',
        description: 'a',
        request: { method: 'GET', path: '/a' },
        response: { status: 200 },
      })
      .interaction({
        id: 'i2',
        description: 'b',
        request: { method: 'POST', path: '/b' },
        response: { status: 201 },
      })
      .build();
    const v2 = new ContractBuilder('web', 'api')
      .version('2.0.0')
      .interaction({
        id: 'i1',
        description: 'a',
        request: { method: 'GET', path: '/a' },
        response: { status: 200 },
      })
      .build();
    const report = analyzer.analyze(v1, v2);
    expect(report.backwardCompatible).toBe(false);
    expect(report.breakingChanges[0]?.kind).toBe('interactionRemoved');
    expect(report.suggestedBump).toBe('major');
  });

  it('detects added interactions as non-breaking minor bump', () => {
    const v1 = baseContract('1.0.0');
    const v2 = new ContractBuilder('web', 'api')
      .version('1.1.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'GET', path: '/users/1' },
        response: { status: 200, body: { id: 1, name: 'a', meta: { age: 30 } } },
      })
      .interaction({
        id: 'i2',
        description: 'new',
        request: { method: 'GET', path: '/new' },
        response: { status: 200 },
      })
      .build();
    const report = analyzer.analyze(v1, v2);
    expect(report.backwardCompatible).toBe(true);
    expect(report.suggestedBump).toBe('minor');
    expect(report.changes.some((c) => c.kind === 'interactionAdded')).toBe(true);
  });

  it('detects response field removal and type change', () => {
    const v2 = new ContractBuilder('web', 'api')
      .version('2.0.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'GET', path: '/users/1' },
        response: { status: 200, body: { id: 's', name: 'a', meta: {} } },
      })
      .build();
    const report = analyzer.analyze(baseContract('1.0.0'), v2);
    const kinds = report.breakingChanges.map((c) => c.kind);
    expect(kinds).toContain('responseFieldTypeChanged'); // id: number -> string
    expect(kinds).toContain('responseFieldRemoved'); // meta.age removed
  });

  it('detects status and request changes', () => {
    const v2 = new ContractBuilder('web', 'api')
      .version('2.0.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'POST', path: '/users/1' },
        response: { status: 200 },
      })
      .build();
    const report = analyzer.analyze(baseContract('1.0.0'), v2);
    expect(report.breakingChanges.some((c) => c.kind === 'requestChanged')).toBe(true);

    const v3 = new ContractBuilder('web', 'api')
      .version('2.0.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'GET', path: '/users/1' },
        response: { status: 201, body: { id: 1, name: 'a', meta: { age: 30 } } },
      })
      .build();
    const r3 = analyzer.analyze(baseContract('1.0.0'), v3);
    expect(r3.breakingChanges.some((c) => c.kind === 'responseStatusChanged')).toBe(true);
  });

  it('detects rule tightening vs relaxing', () => {
    const mk = (min: number | undefined, max: number | undefined): Contract =>
      new ContractBuilder('web', 'api')
        .version('1.0.0')
        .interaction({
          id: 'i1',
          description: 'list',
          request: { method: 'GET', path: '/l' },
          response: { status: 200, body: [] },
          matchingRules: [{ path: '$.body', matcher: 'arrayLength', min, max }],
        })
        .build();
    const tightened = analyzer.analyze(mk(1, 10), mk(3, 8));
    expect(tightened.breakingChanges.filter((c) => c.kind === 'ruleTightened').length).toBe(2);

    const relaxed = analyzer.analyze(mk(3, 8), mk(1, 10));
    expect(relaxed.backwardCompatible).toBe(true);
    expect(relaxed.changes.some((c) => c.kind === 'ruleRelaxed')).toBe(true);
  });

  it('rejects mismatched pairs', () => {
    const other = new ContractBuilder('web', 'other-api').version('1.0.0').build();
    expect(() => analyzer.analyze(baseContract('1.0.0'), other)).toThrow();
  });
});

describe('CompatibilityMatrix', () => {
  const matrix = new CompatibilityMatrix();

  it('isDeployable across compatible versions', () => {
    const old = baseContract('1.0.0');
    const newer = new ContractBuilder('web', 'api')
      .version('1.1.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'GET', path: '/users/1' },
        response: { status: 200, body: { id: 1, name: 'a', meta: { age: 30 } } },
      })
      .interaction({
        id: 'i2',
        description: 'extra',
        request: { method: 'GET', path: '/extra' },
        response: { status: 200 },
      })
      .build();
    const cell = matrix.isDeployable(newer, old);
    expect(cell.compatible).toBe(true);
    expect(cell.reason).toContain('backward-compatible');
  });

  it('flags non-deployable upgrades', () => {
    const old = baseContract('1.0.0');
    const breaking = new ContractBuilder('web', 'api')
      .version('2.0.0')
      .interaction({
        id: 'i1',
        description: 'get user',
        request: { method: 'DELETE', path: '/users/1' },
        response: { status: 204 },
      })
      .build();
    const cell = matrix.isDeployable(breaking, old);
    expect(cell.compatible).toBe(false);
    expect(cell.breakingChanges.length).toBeGreaterThan(0);
  });

  it('builds N×M cell matrix', () => {
    const cells = matrix.build([baseContract('1.0.0'), baseContract('1.1.0')], [baseContract('1.0.0')]);
    expect(cells).toHaveLength(2);
    expect(cells[0]?.consumerVersion).toBe('1.0.0');
    expect(cells[1]?.consumerVersion).toBe('1.1.0');
  });
});
