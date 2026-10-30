/**
 * Tests for LearningMode, FalsePositiveTracker, and WafEngine2.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LearningMode } from '../LearningMode';
import { FalsePositiveTracker } from '../FalsePositiveTracker';
import { WafEngine2 } from '../WafEngine2';
import { GeoBlock } from '../GeoBlock';
import { ManualWafClock2, WafRequest2 } from '../types';

const req = (over: Partial<WafRequest2> = {}): WafRequest2 => ({
  method: 'GET',
  path: '/index',
  query: {},
  headers: {},
  clientIp: '1.2.3.4',
  ...over,
});

describe('LearningMode', () => {
  let lm: LearningMode;

  beforeEach(() => {
    lm = new LearningMode({ minObservations: 3, supportRatio: 0.5 });
  });

  it('suggests a rule once enough flagged requests share a signal', () => {
    for (let i = 0; i < 5; i++) {
      lm.observeFlagged(req({ path: `/admin/p${i}`, headers: { 'x-bot': 'evil' } }));
    }
    const sug = lm.suggest();
    expect(sug.length).toBeGreaterThan(0);
    const headerRule = sug.find((s) => s.expression.includes('header.x-bot == "evil"'));
    expect(headerRule).toBeDefined();
    expect(headerRule!.confidence).toBe(1);
    expect(headerRule!.expression).toContain('path startsWith "/admin"');
  });

  it('requires minObservations before promoting', () => {
    for (let i = 0; i < 2; i++) {
      lm.observeFlagged(req({ path: '/admin/x', headers: { 'x-bot': 'evil' } }));
    }
    expect(lm.suggest()).toEqual([]);
  });

  it('drops low-support signals', () => {
    // 5 flagged: only 2 carry the signal (< 0.5 ratio and < minObs? 2<3)
    lm.observeFlagged(req({ path: '/a/1', headers: { 'x-bot': 'evil' } }));
    lm.observeFlagged(req({ path: '/a/2', headers: { 'x-bot': 'evil' } }));
    lm.observeFlagged(req({ path: '/a/3' }));
    lm.observeFlagged(req({ path: '/a/4' }));
    lm.observeFlagged(req({ path: '/a/5' }));
    const sug = lm.suggest();
    expect(sug.find((s) => s.expression.includes('x-bot'))).toBeUndefined();
  });

  it('promotes recurring body fragments', () => {
    for (let i = 0; i < 4; i++) {
      lm.observeFlagged(req({ path: '/u/login', body: `user='; DROP TABLE--${i}` }), 'DROP TABLE');
    }
    const sug = lm.suggest('/u');
    expect(sug.some((s) => s.expression.includes('body contains "DROP TABLE"'))).toBe(true);
  });

  it('scopes suggestions per path family', () => {
    for (let i = 0; i < 4; i++) {
      lm.observeFlagged(req({ path: `/a/${i}`, method: 'POST' }));
    }
    for (let i = 0; i < 4; i++) {
      lm.observeFlagged(req({ path: `/b/${i}`, method: 'DELETE' }));
    }
    const aSug = lm.suggest('/a');
    expect(aSug.some((s) => s.expression.includes('method == "POST"'))).toBe(true);
    expect(aSug.some((s) => s.expression.includes('method == "DELETE"'))).toBe(false);
  });
});

describe('FalsePositiveTracker', () => {
  let fp: FalsePositiveTracker;

  beforeEach(() => {
    fp = new FalsePositiveTracker({ autoAllowThreshold: 3 });
  });

  it('auto-allowlists a path after threshold FPs', () => {
    fp.recordBlock('r1');
    expect(fp.recordFalsePositive('r1', '/health')).toBe(false);
    fp.recordBlock('r1');
    expect(fp.recordFalsePositive('r1', '/health')).toBe(false);
    fp.recordBlock('r1');
    expect(fp.recordFalsePositive('r1', '/health')).toBe(true); // auto-allow
    expect(fp.isAllowed('r1', '/health')).toBe(true);
  });

  it('supports manual exact and prefix allowlists', () => {
    fp.allow('r1', '/exact');
    fp.allow('r1', '/api/internal/*');
    expect(fp.isAllowed('r1', '/exact')).toBe(true);
    expect(fp.isAllowed('r1', '/api/internal/health')).toBe(true);
    expect(fp.isAllowed('r1', '/api/public')).toBe(false);
    expect(fp.allowlist('r1').sort()).toEqual(['/api/internal/*', '/exact']);
  });

  it('disallow removes entries', () => {
    fp.allow('r1', '/x');
    expect(fp.disallow('r1', '/x')).toBe(true);
    expect(fp.isAllowed('r1', '/x')).toBe(false);
  });

  it('computes fp rate', () => {
    for (let i = 0; i < 4; i++) fp.recordBlock('r1');
    fp.recordFalsePositive('r1', '/a');
    fp.recordFalsePositive('r1', '/b');
    expect(fp.fpRate('r1')).toBe(0.5);
    const s = fp.stats('r1');
    expect(s.blocks).toBe(4);
    expect(s.fps).toBe(2);
  });
});

describe('WafEngine2', () => {
  let clock: ManualWafClock2;
  let engine: WafEngine2;

  beforeEach(() => {
    clock = new ManualWafClock2(0);
    engine = new WafEngine2({ clock });
  });

  it('blocks on DSL rule match', () => {
    engine.addRule({ ruleId: 'sqli', expression: 'body contains "DROP TABLE"', action: 'block' });
    const v = engine.evaluate(req({ path: '/x', body: "1'; DROP TABLE users--" }));
    expect(v.action).toBe('block');
    if (v.action === 'block') expect(v.ruleId).toBe('sqli');
  });

  it('log rules annotate without blocking', () => {
    engine.addRule({ ruleId: 'probe', expression: 'path contains "wp-admin"', action: 'log' });
    const v = engine.evaluate(req({ path: '/wp-admin/x' }));
    expect(v.action).toBe('log');
  });

  it('higher priority rules evaluate first', () => {
    engine.addRule({ ruleId: 'low', expression: 'path startsWith "/"', action: 'log', priority: 0 });
    engine.addRule({ ruleId: 'high', expression: 'method == "GET"', action: 'block', priority: 10 });
    const v = engine.evaluate(req({}));
    expect(v.action).toBe('block');
    if (v.action === 'block') expect(v.ruleId).toBe('high');
  });

  it('geo rule integrates into the pipeline', () => {
    const eng = new WafEngine2({
      clock,
      geo: new GeoBlock({ countries: ['CN'], mode: 'blocklist' }),
    });
    const v = eng.evaluate(req({ country: 'CN' }));
    expect(v.action).toBe('block');
  });

  it('rate rule blocks a flooding client', () => {
    engine.addRateRule({ ruleId: 'flood', when: 'path == "/login"', threshold: 2, blockMs: 60_000 });
    const r = () => req({ path: '/login', clientIp: 'f' });
    expect(engine.evaluate(r()).action).toBe('allow');
    expect(engine.evaluate(r()).action).toBe('allow');
    expect(engine.evaluate(r()).action).toBe('block');
  });

  it('FP allowlist exempts a path from its rule', () => {
    engine.addRule({ ruleId: 'fp-rule', expression: 'path contains "admin"', action: 'block' });
    engine.fp.allow('fp-rule', '/admin/health');
    expect(engine.evaluate(req({ path: '/admin/health' })).action).toBe('allow');
    expect(engine.evaluate(req({ path: '/admin/users' })).action).toBe('block');
  });

  it('flagged traffic feeds learning suggestions', () => {
    engine.addRule({ ruleId: 'r', expression: 'header.x-scan == "1"', action: 'block', fragment: 'x-scan' });
    for (let i = 0; i < 6; i++) {
      engine.evaluate(req({ path: `/scan/${i}`, headers: { 'x-scan': '1' } }));
    }
    const sug = engine.learning.suggest();
    expect(sug.some((s) => s.expression.includes('x-scan'))).toBe(true);
  });

  it('adoptSuggestion installs a learned rule', () => {
    engine.adoptSuggestion({ expression: 'path startsWith "/admin" and method == "POST"' }, 'learned-1', 'block');
    expect(engine.evaluate(req({ path: '/admin/x', method: 'POST' })).action).toBe('block');
    expect(engine.evaluate(req({ path: '/admin/x', method: 'GET' })).action).toBe('allow');
  });
});
