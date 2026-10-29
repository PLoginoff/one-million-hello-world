/**
 * API Versioning — SemVer unit tests.
 */

import { describe, it, expect } from 'bun:test';
import { SemVer, SemVerParseError, satisfies, sortVersions } from '../negotiation';

describe('SemVer.parse', () => {
  it('parses full semver with prerelease + build', () => {
    const v = SemVer.parse('1.2.3-alpha.1+sha.abc');
    expect(v.major).toBe(1);
    expect(v.minor).toBe(2);
    expect(v.patch).toBe(3);
    expect(v.prerelease).toEqual(['alpha', '1']);
    expect(v.build).toBe('sha.abc');
    expect(v.toString()).toBe('1.2.3-alpha.1+sha.abc');
  });

  it('rejects invalid versions', () => {
    expect(() => SemVer.parse('1.02.3')).toThrow(SemVerParseError); // leading zero
    expect(() => SemVer.parse('a.b.c')).toThrow(SemVerParseError);
    expect(() => SemVer.parse('1.2')).toThrow(SemVerParseError);
  });

  it('coerce accepts partial and v-prefixed forms', () => {
    expect(SemVer.coerce('v1.2')?.toString()).toBe('1.2.0');
    expect(SemVer.coerce('2')?.toString()).toBe('2.0.0');
    expect(SemVer.coerce('1.2.3-beta')).toBeDefined();
  });
});

describe('SemVer ordering', () => {
  const cases: Array<[string, string, number]> = [
    ['1.0.0', '2.0.0', -1],
    ['1.1.0', '1.0.9', 1],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0-alpha', '1.0.0', -1],           // prerelease < release
    ['1.0.0-alpha', '1.0.0-alpha.1', -1],   // prefix rule
    ['1.0.0-alpha.1', '1.0.0-alpha.beta', -1], // numeric < alpha
    ['1.0.0-beta.2', '1.0.0-beta.11', -1],  // numeric compare
    ['1.0.0-rc.1', '1.0.0', -1],
    ['1.0.0+build.1', '1.0.0+build.2', 0],  // build ignored
  ];

  for (const [a, b, expected] of cases) {
    it(`${a} vs ${b} → ${expected}`, () => {
      expect(Math.sign(SemVer.parse(a).compare(SemVer.parse(b)))).toBe(expected);
    });
  }

  it('sortVersions orders a realistic set', () => {
    const sorted = sortVersions(['2.0.0', '1.10.0', '1.9.0', '1.10.0-alpha', '0.9.9']);
    expect(sorted).toEqual(['0.9.9', '1.9.0', '1.10.0-alpha', '1.10.0', '2.0.0']);
  });
});

describe('satisfies', () => {
  it('exact and wildcard', () => {
    const v = SemVer.parse('1.2.3');
    expect(satisfies(v, '1.2.3')).toBe(true);
    expect(satisfies(v, '1.2.x')).toBe(true);
    expect(satisfies(v, '1.x')).toBe(true);
    expect(satisfies(v, '2.x')).toBe(false);
    expect(satisfies(v, '*')).toBe(true);
  });

  it('caret + tilde', () => {
    expect(satisfies(SemVer.parse('1.4.0'), '^1.2.3')).toBe(true);
    expect(satisfies(SemVer.parse('2.0.0'), '^1.2.3')).toBe(false);
    expect(satisfies(SemVer.parse('0.2.9'), '^0.2.3')).toBe(true);
    expect(satisfies(SemVer.parse('0.3.0'), '^0.2.3')).toBe(false);
    expect(satisfies(SemVer.parse('1.2.9'), '~1.2.3')).toBe(true);
    expect(satisfies(SemVer.parse('1.3.0'), '~1.2.3')).toBe(false);
  });

  it('comparison conjunctions', () => {
    const v = SemVer.parse('1.5.0');
    expect(satisfies(v, '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfies(v, '>=1.6.0')).toBe(false);
    expect(satisfies(v, '>1.5.0')).toBe(false);
  });
});
