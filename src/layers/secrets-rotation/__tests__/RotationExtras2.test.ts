/**
 * Secrets Rotation extras 2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { PolicyLinter } from '../rotation/PolicyLinter';
import { KeyEscrow } from '../rotation/KeyEscrow';
import { RotationPolicy } from '../rotation/RotationTypes';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const BASE: RotationPolicy = { secretId: 's', intervalMs: 60_000, graceMs: 5_000 };

// ----------------------------------------------------------------- PolicyLinter

describe('PolicyLinter', () => {
  const linter = new PolicyLinter();

  it('clean policy produces no errors', () => {
    const issues = linter.lint(BASE);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(linter.isValid(BASE)).toBe(true);
  });

  it('grace ≥ interval is an error (keys never retire)', () => {
    const issues = linter.lint({ ...BASE, graceMs: 120_000 });
    expect(issues[0].rule).toBe('grace-vs-interval');
    expect(linter.isValid({ ...BASE, graceMs: 120_000 })).toBe(false);
  });

  it('maxKeyAge ≤ interval is an error', () => {
    const issues = linter.lint({ ...BASE, maxKeyAgeMs: 30_000 });
    expect(issues.some((i) => i.rule === 'max-age-vs-interval')).toBe(true);
  });

  it('zero grace warns about cutover outage', () => {
    const issues = linter.lint({ ...BASE, graceMs: 0 });
    expect(issues.some((i) => i.rule === 'zero-grace' && i.severity === 'warning')).toBe(true);
  });

  it('staging ≥ interval is an error', () => {
    const issues = linter.lint({ ...BASE, stagingMs: 60_000 });
    expect(issues.some((i) => i.rule === 'staging-vs-interval')).toBe(true);
  });
});

// -------------------------------------------------------------------- KeyEscrow

describe('KeyEscrow', () => {
  it('seals and reconstructs material with all shares', () => {
    const e = new KeyEscrow(fakeClock().now, () => 0.5);
    const material = new Uint8Array([1, 2, 3, 4, 5]);
    e.seal('e1', 'k1', 's', material, ['alice', 'bob', 'carol']);
    const shares = ['alice', 'bob', 'carol'].map((id) => ({
      custodianId: id,
      bytes: e.shareFor('e1', id)!,
    }));
    const recovered = e.reconstruct('e1', shares);
    expect(recovered).not.toBeNull();
    expect([...recovered!]).toEqual([...material]);
  });

  it('missing share blocks reconstruction', () => {
    const e = new KeyEscrow();
    e.seal('e1', 'k1', 's', new Uint8Array([9, 9]), ['a', 'b']);
    const onlyA = [{ custodianId: 'a', bytes: e.shareFor('e1', 'a')! }];
    expect(e.reconstruct('e1', onlyA)).toBeNull();
  });

  it('wrong share fails the fingerprint check (fail closed)', () => {
    const e = new KeyEscrow(fakeClock().now, () => 0.3);
    e.seal('e1', 'k1', 's', new Uint8Array([7, 8, 9]), ['a', 'b']);
    const forged = [
      { custodianId: 'a', bytes: new Uint8Array([0, 0, 0]) },
      { custodianId: 'b', bytes: e.shareFor('e1', 'b')! },
    ];
    expect(e.reconstruct('e1', forged)).toBeNull();
    expect(e.record('e1')?.sealed).toBe(true);
  });

  it('requires ≥2 custodians', () => {
    const e = new KeyEscrow();
    expect(() => e.seal('x', 'k', 's', new Uint8Array([1]), ['solo'])).toThrow(RangeError);
  });
});
