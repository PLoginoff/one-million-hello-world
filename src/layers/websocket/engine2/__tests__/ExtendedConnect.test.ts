/**
 * Tests for ExtendedConnect — RFC 8441 websocket-over-HTTP/2 negotiation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ExtendedConnect, ExtendedConnectRequest } from '../ExtendedConnect';
import { ManualWsClock2 } from '../types';

const baseReq = (over: Partial<ExtendedConnectRequest> = {}): ExtendedConnectRequest => ({
  method: 'CONNECT',
  protocol: 'websocket',
  scheme: 'https',
  authority: 'example.com',
  path: '/chat',
  ...over,
});

describe('ExtendedConnect', () => {
  let ec: ExtendedConnect;

  beforeEach(() => {
    ec = new ExtendedConnect({
      supportedSubprotocols: ['chat.v2', 'chat.v1'],
      supportedExtensions: ['permessage-deflate'],
      allowedOrigins: ['https://app.example.com'],
      routes: ['/chat', '/feed'],
      clock: new ManualWsClock2(0),
    });
  });

  it('accepts a valid extended CONNECT and returns response headers', () => {
    const v = ec.negotiate(
      baseReq({
        offeredSubprotocols: ['chat.v1', 'chat.v2'],
        offeredExtensions: ['permessage-deflate; client_max_window_bits=12'],
        origin: 'https://app.example.com',
      })
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.selectedSubprotocol).toBe('chat.v2'); // server preference order
      expect(v.selectedExtensions).toHaveLength(1);
      expect(v.responseHeaders['sec-websocket-protocol']).toBe('chat.v2');
      expect(v.responseHeaders[':status']).toBe('200');
    }
  });

  it('rejects non-CONNECT methods with 405', () => {
    const v = ec.negotiate(baseReq({ method: 'GET' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('not-connect');
      expect(v.status).toBe(405);
    }
  });

  it('rejects missing :protocol', () => {
    const v = ec.negotiate(baseReq({ protocol: undefined }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('missing-protocol');
  });

  it('rejects wrong :protocol', () => {
    const v = ec.negotiate(baseReq({ protocol: 'h2c-upgrade' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('wrong-protocol');
  });

  it('rejects unknown paths with 404', () => {
    const v = ec.negotiate(baseReq({ path: '/nope' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('route-not-found');
      expect(v.status).toBe(404);
    }
  });

  it('rejects disallowed origins (CSWSH protection)', () => {
    const v = ec.negotiate(baseReq({ origin: 'https://evil.example.com' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('origin-denied');
      expect(v.status).toBe(403);
    }
  });

  it('rejects when subprotocol required but no overlap', () => {
    const strict = new ExtendedConnect({
      supportedSubprotocols: ['chat.v2'],
      requireSubprotocol: true,
      routes: ['/chat'],
    });
    const v = strict.negotiate(baseReq({ offeredSubprotocols: ['other'] }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('no-subprotocol');
  });

  it('proceeds with null subprotocol when none required and no overlap', () => {
    const v = ec.negotiate(baseReq({ offeredSubprotocols: ['unrelated'] }));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.selectedSubprotocol).toBeNull();
      expect(v.responseHeaders['sec-websocket-protocol']).toBeUndefined();
    }
  });

  it('tracks open tunnels and closes them', () => {
    const v = ec.negotiate(baseReq());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(ec.isOpen(v.tunnelId)).toBe(true);
    expect(ec.openTunnelCount).toBe(1);
    expect(ec.closeTunnel(v.tunnelId)).toBe(true);
    expect(ec.isOpen(v.tunnelId)).toBe(false);
    expect(ec.openTunnelCount).toBe(0);
    expect(ec.tunnel(v.tunnelId)).toBeNull();
    expect(ec.forget(v.tunnelId)).toBe(true);
  });

  it('keeps only extensions both sides support', () => {
    const v = ec.negotiate(
      baseReq({ offeredExtensions: ['permessage-deflate', 'x-unknown-ext'] })
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.selectedExtensions).toEqual(['permessage-deflate']);
    }
  });
});
