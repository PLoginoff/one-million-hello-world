/**
 * Tests for HeaderGovernor: hop-by-hop stripping, dynamic Connection
 * nominations, rule ordering and preset policies.
 */

import { describe, it, expect } from 'bun:test';
import {
  HeaderGovernor,
  connectionNominatedHeaders,
  securityHeadersPolicy,
  forwardingHeadersPolicy,
  HOP_BY_HOP,
} from '../HeaderGovernor';

describe('connectionNominatedHeaders', () => {
  it('parses the dynamic strip list', () => {
    expect(connectionNominatedHeaders('keep-alive, X-Foo, x-bar')).toEqual(['x-foo', 'x-bar']);
    expect(connectionNominatedHeaders(undefined)).toEqual([]);
    expect(connectionNominatedHeaders('upgrade')).toEqual([]); // hop-by-hop itself, not nominated
  });
});

describe('HeaderGovernor — hop-by-hop', () => {
  it('strips the RFC hop-by-hop set', () => {
    const g = new HeaderGovernor();
    const out = g.applyRequest({
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=5',
      'Transfer-Encoding': 'chunked',
      'X-Real': 'yes',
      TE: 'trailers',
    });
    expect(out['connection']).toBeUndefined();
    expect(out['keep-alive']).toBeUndefined();
    expect(out['transfer-encoding']).toBeUndefined();
    expect(out['te']).toBeUndefined();
    expect(out['x-real']).toBe('yes');
  });

  it('strips headers nominated by Connection dynamically', () => {
    const g = new HeaderGovernor();
    const out = g.applyRequest({
      Connection: 'keep-alive, X-Secret, X-Other',
      'X-Secret': 'leak',
      'X-Other': 'leak2',
      'X-Keep': 'safe',
    });
    expect(out['x-secret']).toBeUndefined();
    expect(out['x-other']).toBeUndefined();
    expect(out['x-keep']).toBe('safe');
  });

  it('can disable hop-by-hop stripping', () => {
    const g = new HeaderGovernor({ stripHopByHop: false });
    const out = g.applyRequest({ connection: 'keep-alive', upgrade: 'websocket' });
    expect(out['connection']).toBe('keep-alive');
    expect(out['upgrade']).toBe('websocket');
  });
});

describe('HeaderGovernor — rules', () => {
  it('strip removes exact names and wildcards', () => {
    const g = new HeaderGovernor({
      request: [
        { kind: 'strip', name: 'x-secret' },
        { kind: 'strip', name: 'x-internal-*' },
      ],
    });
    const out = g.applyRequest({
      'x-secret': 's',
      'x-internal-trace': 't',
      'x-internal-debug': 'd',
      'x-public': 'p',
    });
    expect(out['x-secret']).toBeUndefined();
    expect(out['x-internal-trace']).toBeUndefined();
    expect(out['x-public']).toBe('p');
  });

  it('set overwrites; set-if-absent only fills gaps', () => {
    const g = new HeaderGovernor({
      request: [
        { kind: 'set', name: 'x-gw', value: 'edge-1' },
        { kind: 'set-if-absent', name: 'x-forwarded-proto', value: 'https' },
      ],
    });
    const out = g.applyRequest({ 'x-forwarded-proto': 'http', 'x-gw': 'upstream' });
    expect(out['x-gw']).toBe('edge-1');
    expect(out['x-forwarded-proto']).toBe('http'); // kept
    const out2 = g.applyRequest({});
    expect(out2['x-forwarded-proto']).toBe('https');
  });

  it('append comma-joins values', () => {
    const g = new HeaderGovernor({
      request: [{ kind: 'append', name: 'x-forwarded-for', value: '1.2.3.4' }],
    });
    expect(g.applyRequest({ 'x-forwarded-for': '9.9.9.9' })['x-forwarded-for']).toBe(
      '9.9.9.9, 1.2.3.4'
    );
    expect(g.applyRequest({})['x-forwarded-for']).toBe('1.2.3.4');
  });

  it('rename moves a value to a new key', () => {
    const g = new HeaderGovernor({
      request: [{ kind: 'rename', from: 'x-user-id', to: 'x-authenticated-user' }],
    });
    const out = g.applyRequest({ 'x-user-id': 'u42' });
    expect(out['x-authenticated-user']).toBe('u42');
    expect(out['x-user-id']).toBeUndefined();
  });

  it('transform applies the function to the value', () => {
    const g = new HeaderGovernor({
      request: [{ kind: 'transform', name: 'authorization', fn: (v) => v.replace(/^Bearer /, '') }],
    });
    const out = g.applyRequest({ authorization: 'Bearer abc' });
    expect(out['authorization']).toBe('abc');
  });

  it('rules run in declaration order', () => {
    const g = new HeaderGovernor({
      request: [
        { kind: 'set', name: 'x-v', value: 'first' },
        { kind: 'set', name: 'x-v', value: 'second' },
      ],
    });
    expect(g.applyRequest({})['x-v']).toBe('second');
  });

  it('response direction applies its own rule set', () => {
    const g = new HeaderGovernor({
      request: [{ kind: 'set', name: 'x-dir', value: 'req' }],
      response: [{ kind: 'set', name: 'x-dir', value: 'res' }],
    });
    expect(g.applyRequest({})['x-dir']).toBe('req');
    expect(g.applyResponse({})['x-dir']).toBe('res');
  });
});

describe('HeaderGovernor — response extras', () => {
  it('via tag appends to existing via', () => {
    const g = new HeaderGovernor({ viaTag: '1.1 gw-a' });
    expect(g.applyResponse({})['via']).toBe('1.1 gw-a');
    expect(g.applyResponse({ via: '1.0 proxy' })['via']).toBe('1.0 proxy, 1.1 gw-a');
  });
});

describe('preset policies', () => {
  it('securityHeadersPolicy strips server leakage and sets hardening headers', () => {
    const g = new HeaderGovernor({ response: securityHeadersPolicy() });
    const out = g.applyResponse({
      server: 'nginx/1.25',
      'x-powered-by': 'Express',
      'content-type': 'text/html',
    });
    expect(out['server']).toBeUndefined();
    expect(out['x-powered-by']).toBeUndefined();
    expect(out['x-content-type-options']).toBe('nosniff');
    expect(out['x-frame-options']).toBe('DENY');
    expect(out['content-type']).toBe('text/html');
    // Upstream-provided security headers are kept.
    const out2 = g.applyResponse({ 'x-frame-options': 'SAMEORIGIN' });
    expect(out2['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('forwardingHeadersPolicy appends client ip and strips internals', () => {
    const g = new HeaderGovernor({ request: forwardingHeadersPolicy('gw-42') });
    const out = g.applyRequest({ 'x-forwarded-for': '1.1.1.1', 'x-internal-raw': 'x' });
    expect(out['x-gateway']).toBe('gw-42');
    expect(out['x-internal-raw']).toBeUndefined();
    expect(out['x-forwarded-for']).toBe('1.1.1.1, {{client-ip}}');
  });

  it('HOP_BY_HOP covers the RFC set', () => {
    for (const h of ['connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade']) {
      expect(HOP_BY_HOP.has(h)).toBe(true);
    }
  });
});
