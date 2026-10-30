/**
 * Tests for RuleDsl, GeoBlock, and RateRule.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { parseDsl, evalDsl, CompiledDsl, DslParseError } from '../RuleDsl';
import { GeoBlock } from '../GeoBlock';
import { RateRule } from '../RateRule';
import { ManualWafClock2, WafRequest2 } from '../types';

const req = (over: Partial<WafRequest2> = {}): WafRequest2 => ({
  method: 'GET',
  path: '/index',
  query: {},
  headers: {},
  clientIp: '1.2.3.4',
  ...over,
});

describe('RuleDsl', () => {
  it('parses and evaluates simple comparisons', () => {
    const dsl = new CompiledDsl('path == "/admin"');
    expect(dsl.matches(req({ path: '/admin' }))).toBe(true);
    expect(dsl.matches(req({ path: '/other' }))).toBe(false);
  });

  it('supports and/or/not precedence: not > and > or', () => {
    // "a or b and c" must parse as "a or (b and c)"
    const ast = parseDsl('method == "GET" or method == "POST" and path == "/x"');
    expect(evalDsl(ast, req({ method: 'GET' }))).toBe(true);
    expect(evalDsl(ast, req({ method: 'POST', path: '/y' }))).toBe(false);
    expect(evalDsl(ast, req({ method: 'POST', path: '/x' }))).toBe(true);
  });

  it('supports parentheses', () => {
    const ast = parseDsl('(method == "GET" or method == "POST") and path == "/x"');
    expect(evalDsl(ast, req({ method: 'POST', path: '/x' }))).toBe(true);
    expect(evalDsl(ast, req({ method: 'GET', path: '/y' }))).toBe(false);
  });

  it('supports not', () => {
    const dsl = new CompiledDsl('not path startsWith "/public"');
    expect(dsl.matches(req({ path: '/public/x' }))).toBe(false);
    expect(dsl.matches(req({ path: '/private' }))).toBe(true);
  });

  it('supports contains / startsWith / endsWith / matches', () => {
    expect(new CompiledDsl('body contains "drop"').matches(req({ body: 'x drop table y' }))).toBe(true);
    expect(new CompiledDsl('path startsWith "/api"').matches(req({ path: '/api/v1' }))).toBe(true);
    expect(new CompiledDsl('path endsWith ".php"').matches(req({ path: '/x.php' }))).toBe(true);
    expect(new CompiledDsl('path matches "^/a[0-9]+$"').matches(req({ path: '/a42' }))).toBe(true);
    expect(new CompiledDsl('path matches "^/a[0-9]+$"').matches(req({ path: '/ab' }))).toBe(false);
  });

  it('supports header and query fields', () => {
    const r = req({
      headers: { 'x-role': 'admin' },
      query: { size: '2048' },
    });
    expect(new CompiledDsl('header.x-role == "admin"').matches(r)).toBe(true);
    expect(new CompiledDsl('query.size gt 1000').matches(r)).toBe(true);
    expect(new CompiledDsl('query.size lt 1000').matches(r)).toBe(false);
    // Missing header → false, never throws.
    expect(new CompiledDsl('header.x-missing == "x"').matches(r)).toBe(false);
  });

  it('supports in-list', () => {
    const dsl = new CompiledDsl('country in ("CN", "KP", "IR")');
    expect(dsl.matches(req({ country: 'KP' }))).toBe(true);
    expect(dsl.matches(req({ country: 'DE' }))).toBe(false);
    expect(dsl.matches(req({}))).toBe(false); // no country
  });

  it('supports quoted literals with escapes', () => {
    const dsl = new CompiledDsl('body contains "a\\"b"');
    expect(dsl.matches(req({ body: 'xa"b y' }))).toBe(true);
  });

  it('throws DslParseError on malformed input', () => {
    expect(() => parseDsl('path ==')).toThrow(DslParseError);
    expect(() => parseDsl('path == "x" trailing')).toThrow(DslParseError);
    expect(() => parseDsl('(path == "x"')).toThrow(DslParseError);
    expect(() => parseDsl('path frobnicate "x"')).toThrow(DslParseError);
    expect(() => parseDsl('path == "unterminated')).toThrow(DslParseError);
  });

  it('gt/lt compare numerically', () => {
    const dsl = new CompiledDsl('query.n gt 5');
    expect(dsl.matches(req({ query: { n: '10' } }))).toBe(true);
    expect(dsl.matches(req({ query: { n: '3' } }))).toBe(false);
  });
});

describe('GeoBlock', () => {
  it('blocklist blocks listed countries', () => {
    const g = new GeoBlock({ countries: ['CN', 'kp'], mode: 'blocklist' });
    expect(g.evaluate(req({ country: 'cn' }))?.action).toBe('block');
    expect(g.evaluate(req({ country: 'DE' }))).toBeNull();
  });

  it('allowlist blocks unlisted countries', () => {
    const g = new GeoBlock({ countries: ['DE'], mode: 'allowlist' });
    expect(g.evaluate(req({ country: 'FR' }))?.action).toBe('block');
    expect(g.evaluate(req({ country: 'de' }))).toBeNull();
  });

  it('uses resolver when request lacks a country', () => {
    const g = new GeoBlock({
      countries: ['CN'],
      mode: 'blocklist',
      countryResolver: (ip) => (ip === '9.9.9.9' ? 'CN' : 'DE'),
    });
    expect(g.evaluate(req({ clientIp: '9.9.9.9' }))?.action).toBe('block');
    expect(g.evaluate(req({ clientIp: '8.8.8.8' }))).toBeNull();
  });

  it('undeclaredBehavior decides for unknown countries', () => {
    const open = new GeoBlock({ countries: ['CN'], mode: 'blocklist' });
    expect(open.evaluate(req({}))).toBeNull();
    const closed = new GeoBlock({ countries: ['CN'], mode: 'blocklist', undeclaredBehavior: 'block' });
    expect(closed.evaluate(req({}))?.action).toBe('block');
  });
});

describe('RateRule', () => {
  let clock: ManualWafClock2;
  let rule: RateRule;

  beforeEach(() => {
    clock = new ManualWafClock2(0);
    rule = new RateRule(
      { ruleId: 'rl1', when: 'path startsWith "/api"', threshold: 3, windowMs: 10_000, blockMs: 30_000 },
      clock
    );
  });

  it('ignores non-matching requests', () => {
    for (let i = 0; i < 10; i++) {
      expect(rule.observe(req({ path: '/static' }))).toBeNull();
    }
    expect(rule.partitionCount).toBe(0);
  });

  it('fires when the per-key window count crosses threshold', () => {
    const r = () => req({ path: '/api/x', clientIp: '1.1.1.1' });
    expect(rule.observe(r())).toBeNull(); // 1
    expect(rule.observe(r())).toBeNull(); // 2
    expect(rule.observe(r())).toBeNull(); // 3 — not over yet
    const hit = rule.observe(r()); // 4 > 3
    expect(hit?.action).toBe('block');
    expect(rule.isBlocked('1.1.1.1')).toBe(true);
  });

  it('keeps blocking during blockMs without re-counting', () => {
    const r = () => req({ path: '/api/x', clientIp: '2.2.2.2' });
    for (let i = 0; i < 4; i++) rule.observe(r());
    clock.advance(15_000); // window expired but block (30s) holds
    const hit = rule.observe(r());
    expect(hit?.reason).toContain('still in block window');
  });

  it('partitions independently per key', () => {
    const a = () => req({ path: '/api/x', clientIp: 'a' });
    const b = () => req({ path: '/api/x', clientIp: 'b' });
    for (let i = 0; i < 4; i++) rule.observe(a());
    expect(rule.isBlocked('a')).toBe(true);
    expect(rule.observe(b())).toBeNull();
    expect(rule.isBlocked('b')).toBe(false);
  });

  it('sliding window lets partitions recover', () => {
    const r = () => req({ path: '/api/x', clientIp: 'c' });
    for (let i = 0; i < 3; i++) rule.observe(r());
    clock.advance(11_000); // window slid past all 3
    expect(rule.countFor('c')).toBe(0);
    expect(rule.observe(r())).toBeNull(); // 1 again, not 4
  });

  it('release lifts a block manually', () => {
    const r = () => req({ path: '/api/x', clientIp: 'd' });
    for (let i = 0; i < 4; i++) rule.observe(r());
    expect(rule.isBlocked('d')).toBe(true);
    rule.release('d');
    expect(rule.isBlocked('d')).toBe(false);
  });

  it('supports custom key extractors', () => {
    const perSession = new RateRule(
      {
        ruleId: 'rs',
        when: 'path == "/login"',
        threshold: 1,
        keyOf: (r) => r.headers['x-session'] ?? r.clientIp,
      },
      clock
    );
    perSession.observe(req({ path: '/login', headers: { 'x-session': 's1' }, clientIp: 'a' }));
    perSession.observe(req({ path: '/login', headers: { 'x-session': 's1' }, clientIp: 'b' }));
    expect(perSession.isBlocked('s1')).toBe(true);
  });
});
