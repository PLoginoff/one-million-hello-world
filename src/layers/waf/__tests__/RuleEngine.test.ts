/**
 * Tests for WafRuleEngine AST evaluation and priority ordering.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { WafRuleEngine } from '../strategies/RuleEngine';
import { HttpRequest, WafRule } from '../types/http';

const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  path: '/api/users',
  query: {},
  headers: {},
  clientIp: '10.0.0.1',
  ...over,
});

function rule(
  id: string,
  priority: number,
  action: WafRule['action'],
  pattern: string,
  target: 'path' | 'body' | 'method' = 'path'
): WafRule {
  return {
    id,
    name: id,
    priority,
    action,
    score: 0.5,
    ast: {
      type: 'condition',
      condition: { target, kind: 'contains', pattern },
    },
  };
}

describe('WafRuleEngine', () => {
  let engine: WafRuleEngine;

  beforeEach(() => {
    engine = new WafRuleEngine();
  });

  it('empty engine allows everything', () => {
    const v = engine.inspect(req());
    expect(v.action).toBe('allow');
    expect(v.matched.length).toBe(0);
  });

  it('first matching non-log rule wins by priority', () => {
    engine.addRule(rule('low', 10, 'log', 'users'));
    engine.addRule(rule('high', 100, 'block', 'users'));
    engine.addRule(rule('mid', 50, 'captcha', 'users'));
    const v = engine.inspect(req());
    expect(v.action).toBe('block');
    expect(v.matched.map((m) => m.ruleId)).toEqual(['high']);
  });

  it('log rules observe but do not terminate', () => {
    engine.addRule(rule('log1', 100, 'log', 'users'));
    engine.addRule(rule('block1', 50, 'block', 'users'));
    const v = engine.inspect(req());
    expect(v.action).toBe('block');
    expect(v.matched.length).toBe(2);
    expect(v.matched[0].ruleId).toBe('log1');
    expect(v.matched[1].ruleId).toBe('block1');
  });

  it('only log rules → allow with annotations', () => {
    engine.addRule(rule('log1', 100, 'log', 'users'));
    engine.addRule(rule('log2', 90, 'log', 'users'));
    const v = engine.inspect(req());
    expect(v.action).toBe('allow');
    expect(v.matched.length).toBe(2);
  });

  it('AND composition: all children must match', () => {
    engine.addRule({
      id: 'and-rule',
      name: 'admin only POST',
      priority: 100,
      action: 'block',
      score: 0.9,
      ast: {
        type: 'and',
        children: [
          { type: 'condition', condition: { target: 'path', kind: 'startsWith', pattern: '/admin' } },
          { type: 'condition', condition: { target: 'method', kind: 'equals', pattern: 'POST' } },
        ],
      },
    });
    expect(engine.inspect(req({ path: '/admin/x', method: 'GET' })).action).toBe('allow');
    expect(engine.inspect(req({ path: '/admin/x', method: 'POST' })).action).toBe('block');
  });

  it('OR composition: any child match is enough', () => {
    engine.addRule({
      id: 'or-rule',
      name: 'sql or xss',
      priority: 100,
      action: 'block',
      score: 0.9,
      ast: {
        type: 'or',
        children: [
          { type: 'condition', condition: { target: 'body', kind: 'contains', pattern: 'union select' } },
          { type: 'condition', condition: { target: 'body', kind: 'contains', pattern: '<script' } },
        ],
      },
    });
    expect(engine.inspect(req({ body: 'hello' })).action).toBe('allow');
    expect(engine.inspect(req({ body: '1 union select 2' })).action).toBe('block');
    expect(engine.inspect(req({ body: '<script>alert(1)</script>' })).action).toBe('block');
  });

  it('NOT inverts a condition', () => {
    engine.addRule({
      id: 'not-rule',
      name: 'not-internal',
      priority: 100,
      action: 'block',
      score: 0.9,
      ast: {
        type: 'and',
        children: [
          { type: 'condition', condition: { target: 'path', kind: 'startsWith', pattern: '/api' } },
          {
            type: 'not',
            child: {
              type: 'condition',
              condition: { target: 'clientIp', kind: 'ip-in-list', pattern: ['10.0.0.1'] },
            },
          },
        ],
      },
    });
    // 10.0.0.1 is whitelisted by NOT → allowed
    expect(engine.inspect(req({ clientIp: '10.0.0.1' })).action).toBe('allow');
    // Other IPs are blocked
    expect(engine.inspect(req({ clientIp: '9.9.9.9' })).action).toBe('block');
  });

  it('removeRule stops it matching', () => {
    engine.addRule(rule('gone', 100, 'block', 'users'));
    expect(engine.inspect(req()).action).toBe('block');
    engine.removeRule('gone');
    expect(engine.inspect(req()).action).toBe('allow');
  });

  it('disabled rules do not match', () => {
    const r = rule('off', 100, 'block', 'users');
    engine.addRule({ ...r, disabled: true });
    expect(engine.inspect(req()).action).toBe('allow');
  });
});
