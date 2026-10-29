/**
 * Tests for matcher primitives.
 */

import { describe, it, expect } from 'bun:test';
import {
  applyTransform,
  safeUrlDecode,
  normalizePath,
  extractTarget,
  compileCondition,
} from '../strategies/Matchers';
import { HttpRequest } from '../types/http';

const req: HttpRequest = {
  method: 'GET',
  path: '/api/users',
  query: { q: 'hello world', id: '42' },
  headers: { 'User-Agent': 'TestClient/1.0', 'X-Custom': 'v1' },
  body: 'body content here',
  clientIp: '192.0.2.1',
};

describe('transforms', () => {
  it('lowercase/uppercase', () => {
    expect(applyTransform('AbC', 'lowercase')).toBe('abc');
    expect(applyTransform('AbC', 'uppercase')).toBe('ABC');
  });

  it('urldecode decodes + and %XX', () => {
    expect(safeUrlDecode('hello+world')).toBe('hello world');
    expect(safeUrlDecode('%27%20OR%20%271%27%3D%271')).toBe("' OR '1'='1");
  });

  it('urldecode handles double-encoded payloads', () => {
    // %2527 → %27 → '
    expect(safeUrlDecode('%2527')).toBe("'");
  });

  it('normalize-path collapses .. and .', () => {
    expect(normalizePath('/a/b/../c')).toBe('/a/c');
    expect(normalizePath('/a/./b')).toBe('/a/b');
    expect(normalizePath('/../../etc/passwd')).toBe('/etc/passwd'); // extra .. dropped
    expect(normalizePath('/a//b')).toBe('/a/b');
  });

  it('strip-whitespace removes all whitespace', () => {
    expect(applyTransform('a b\tc\nd', 'strip-whitespace')).toBe('abcd');
  });
});

describe('extractTarget', () => {
  it('path/method/clientIp/body', () => {
    expect(extractTarget(req, 'path')).toBe('/api/users');
    expect(extractTarget(req, 'method')).toBe('GET');
    expect(extractTarget(req, 'clientIp')).toBe('192.0.2.1');
    expect(extractTarget(req, 'body')).toBe('body content here');
  });

  it('header:<name> is case-insensitive on the name', () => {
    expect(extractTarget(req, 'header:user-agent')).toBe('TestClient/1.0');
    expect(extractTarget(req, 'header:X-Custom')).toBe('v1');
    expect(extractTarget(req, 'header:missing')).toBe('');
  });

  it('query serializes k=v pairs', () => {
    const q = extractTarget(req, 'query');
    expect(q).toContain('q=hello world');
    expect(q).toContain('id=42');
  });
});

describe('compileCondition', () => {
  it('regex matcher with ignoreCase', () => {
    const m = compileCondition({
      target: 'body',
      kind: 'regex',
      pattern: 'CONTENT',
      ignoreCase: true,
    });
    expect(m.match(req).hit).toBe(true);
  });

  it('regex matcher case-sensitive by default', () => {
    const m = compileCondition({
      target: 'body',
      kind: 'regex',
      pattern: 'CONTENT',
    });
    expect(m.match(req).hit).toBe(false);
  });

  it('contains/equals/startsWith/endsWith', () => {
    expect(
      compileCondition({ target: 'path', kind: 'contains', pattern: 'users' }).match(req).hit
    ).toBe(true);
    expect(
      compileCondition({ target: 'method', kind: 'equals', pattern: 'GET' }).match(req).hit
    ).toBe(true);
    expect(
      compileCondition({ target: 'path', kind: 'startsWith', pattern: '/api' }).match(req).hit
    ).toBe(true);
    expect(
      compileCondition({ target: 'path', kind: 'endsWith', pattern: 'users' }).match(req).hit
    ).toBe(true);
  });

  it('ip-in-list', () => {
    const m = compileCondition({
      target: 'clientIp',
      kind: 'ip-in-list',
      pattern: ['192.0.2.1', '203.0.113.7'],
    });
    expect(m.match(req).hit).toBe(true);
    const miss = compileCondition({
      target: 'clientIp',
      kind: 'ip-in-list',
      pattern: ['10.0.0.1'],
    });
    expect(miss.match(req).hit).toBe(false);
  });

  it('transforms apply before matching', () => {
    const m = compileCondition({
      target: 'path',
      kind: 'equals',
      pattern: '/etc/passwd',
      transforms: ['urldecode', 'normalize-path'],
    });
    const encoded: HttpRequest = { ...req, path: '/%2e%2e/%2e%2e/etc/passwd' };
    expect(m.match(encoded).hit).toBe(true);
  });
});
