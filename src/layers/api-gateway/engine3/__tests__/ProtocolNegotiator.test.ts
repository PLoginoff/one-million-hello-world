/**
 * Tests for ProtocolNegotiator: origin checks, subprotocol selection
 * and extension offer parsing/negotiation.
 */

import { describe, it, expect } from 'bun:test';
import {
  originAllowed,
  parseProtocolOffer,
  negotiateSubprotocol,
  parseExtensions,
  negotiateExtensions,
  formatExtensionResponse,
  ExtensionParseError,
} from '../ProtocolNegotiator';

describe('originAllowed', () => {
  it('empty allowlist means no check', () => {
    expect(originAllowed(undefined, [])).toBe(true);
    expect(originAllowed('https://evil.com', [])).toBe(false);
  });

  it('wildcard allows any origin including absent', () => {
    expect(originAllowed('https://a.com', ['*'])).toBe(true);
    expect(originAllowed(undefined, ['*'])).toBe(true);
  });

  it('exact host and origin matching', () => {
    expect(originAllowed('https://app.example.com', ['https://app.example.com'])).toBe(true);
    expect(originAllowed('https://app.example.com', ['app.example.com'])).toBe(true);
    expect(originAllowed('https://other.com', ['app.example.com'])).toBe(false);
  });

  it('subdomain suffix patterns', () => {
    const rules = ['*.example.com'];
    expect(originAllowed('https://a.example.com', rules)).toBe(true);
    expect(originAllowed('https://deep.a.example.com', rules)).toBe(true);
    expect(originAllowed('https://example.com', rules)).toBe(true);
    expect(originAllowed('https://notexample.com', rules)).toBe(false);
    expect(originAllowed('https://example.com.evil.io', rules)).toBe(false);
  });

  it('null origin treated as absent', () => {
    expect(originAllowed('null', ['example.com'])).toBe(false);
    expect(originAllowed('null', ['*'])).toBe(true);
  });

  it('scheme must match for full-origin patterns', () => {
    expect(originAllowed('https://app.com', ['http://app.com'])).toBe(false);
    expect(originAllowed('http://app.com', ['http://app.com'])).toBe(true);
  });
});

describe('subprotocol negotiation', () => {
  it('picks first client offer the gateway supports', () => {
    const v = negotiateSubprotocol(['chat', 'superchat'], ['superchat', 'chat']);
    expect(v).toEqual({ kind: 'selected', protocol: 'chat' });
  });

  it('returns none when nothing overlaps', () => {
    expect(negotiateSubprotocol(['mqtt'], ['wamp'])).toEqual({ kind: 'none' });
  });

  it('required protocol rejects when unoffered', () => {
    const v = negotiateSubprotocol(['chat'], ['chat'], 'mqtt');
    expect(v.kind).toBe('reject');
  });

  it('required protocol wins when offered anywhere in the list', () => {
    const v = negotiateSubprotocol(['chat', 'mqtt'], ['chat'], 'mqtt');
    expect(v).toEqual({ kind: 'selected', protocol: 'mqtt' });
  });

  it('parseProtocolOffer splits and trims', () => {
    expect(parseProtocolOffer('chat, superchat ,  wamp.v2')).toEqual([
      'chat',
      'superchat',
      'wamp.v2',
    ]);
    expect(parseProtocolOffer(undefined)).toEqual([]);
    expect(parseProtocolOffer('')).toEqual([]);
  });
});

describe('extension parsing', () => {
  it('parses simple and parameterized offers', () => {
    const offers = parseExtensions(
      'permessage-deflate; client_max_window_bits, x-custom; a=1; flag'
    );
    expect(offers.length).toBe(2);
    expect(offers[0]!.name).toBe('permessage-deflate');
    expect(offers[0]!.params['client_max_window_bits']).toBe(true);
    expect(offers[1]!.name).toBe('x-custom');
    expect(offers[1]!.params['a']).toBe('1');
    expect(offers[1]!.params['flag']).toBe(true);
  });

  it('parses quoted parameter values', () => {
    const offers = parseExtensions('ext; p="quoted value"; q="esc\\"aped"');
    expect(offers[0]!.params['p']).toBe('quoted value');
    expect(offers[0]!.params['q']).toBe('esc"aped');
  });

  it('parses multiple offers separated by commas', () => {
    const offers = parseExtensions('permessage-deflate, permessage-deflate; server_max_window_bits=10');
    expect(offers.length).toBe(2);
  });

  it('rejects malformed input', () => {
    expect(() => parseExtensions('ext;')).toThrow(ExtensionParseError);
    expect(() => parseExtensions('ext,')).toThrow(ExtensionParseError);
    expect(() => parseExtensions('ext; p="unterminated')).toThrow(ExtensionParseError);
    expect(() => parseExtensions('ext; p=()')).toThrow(ExtensionParseError);
  });
});

describe('extension negotiation', () => {
  it('passthrough echoes clamped permessage-deflate params', () => {
    const offers = parseExtensions('permessage-deflate; server_max_window_bits=20; client_max_window_bits');
    const decisions = negotiateExtensions(offers, { 'permessage-deflate': 'passthrough' });
    const d = decisions[0]!;
    expect(d.disposition).toBe('passthrough');
    // 20 clamped to 15.
    expect(d.acceptedParams['server_max_window_bits']).toBe('15');
    expect(d.acceptedParams['client_max_window_bits']).toBe(true);
  });

  it('window bits clamp to [8,15]', () => {
    const offers = parseExtensions('permessage-deflate; server_max_window_bits=3; client_max_window_bits=20');
    const d = negotiateExtensions(offers, { 'permessage-deflate': 'terminate' })[0]!;
    expect(d.acceptedParams['server_max_window_bits']).toBe('8');
    expect(d.acceptedParams['client_max_window_bits']).toBe('15');
  });

  it('unknown extensions strip by default', () => {
    const offers = parseExtensions('x-unknown; p=1, permessage-deflate');
    const decisions = negotiateExtensions(offers, { 'permessage-deflate': 'passthrough' });
    expect(decisions[0]!.disposition).toBe('strip');
    expect(decisions[1]!.disposition).toBe('passthrough');
  });

  it('formatExtensionResponse serializes accepted decisions', () => {
    const offers = parseExtensions('permessage-deflate; server_max_window_bits=10, x-skip');
    const decisions = negotiateExtensions(offers, { 'permessage-deflate': 'passthrough' });
    expect(formatExtensionResponse(decisions)).toBe(
      'permessage-deflate; server_max_window_bits=10'
    );
  });

  it('formatExtensionResponse returns undefined when everything strips', () => {
    const offers = parseExtensions('x-a, x-b; p=1');
    const decisions = negotiateExtensions(offers, {});
    expect(formatExtensionResponse(decisions)).toBeUndefined();
  });
});
