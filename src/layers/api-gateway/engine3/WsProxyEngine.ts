/**
 * WebSocket Proxy Engine
 *
 * Gateway-side WebSocket support in three parts:
 *
 * 1. **Upgrade handling** — validates the HTTP/1.1 upgrade handshake
 *    (method, `Upgrade`/`Connection` headers, `Sec-WebSocket-Key`,
 *    version 13) and computes the RFC 6455 `Sec-WebSocket-Accept`
 *    value: `base64(SHA1(key + GUID))`.
 *
 * 2. **Frame codec** — incremental RFC 6455 frame decoder/encoder:
 *    7/16/64-bit lengths, client masking (upstream-bound frames are
 *    masked per spec, inbound frames are unmasked on decode),
 *    fragmentation and control frames.
 *
 * 3. **Bidirectional relay** — two endpoints (client, upstream)
 *    wired so bytes arriving on either side are decoded, passed
 *    through an optional inspection hook, re-encoded correctly for
 *    the destination direction, and forwarded. Pings are answered
 *    locally; closes tear down both sides.
 *
 * Sockets are duck-typed `WsEndpoint`s so the whole engine is
 * testable in memory. Relay feeding is push-based: the adapter calls
 * `relay.feedClient(bytes)` / `relay.feedUpstream(bytes)` from its
 * socket `data` handlers.
 *
 * Complexity: encode/decode are O(payload); relay O(frames per chunk).
 *
 * @module ApiGatewayLayer/Engine3
 */

import { createHash } from 'crypto';
import {
  WS_OP_CLOSE,
  WS_OP_CONTINUATION,
  WS_OP_PING,
  WS_OP_PONG,
  WsDecodeResult,
  WsEndpoint,
  WsFrame,
  WsRelayHooks,
  WsRelayStats,
  WsUpgradeRequest,
  WsUpgradeVerdict,
} from './types3';

/** RFC 6455 §1.3 magic GUID for the accept-key handshake. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Compute `Sec-WebSocket-Accept` for a client key. */
export function wsAcceptKey(key: string): string {
  return createHash('sha1').update(key + WS_GUID, 'utf8').digest('base64');
}

/**
 * Validate an upgrade request. Returns either the computed accept key
 * plus the upstream path to connect to, or an HTTP-style rejection.
 */
export function evaluateUpgrade(req: WsUpgradeRequest): WsUpgradeVerdict {
  if (req.method.toUpperCase() !== 'GET') {
    return { ok: false, status: 405, reason: 'WebSocket upgrade requires GET' };
  }
  const upgrade = req.headers['upgrade']?.toLowerCase();
  if (upgrade !== 'websocket') {
    return { ok: false, status: 400, reason: 'missing or invalid Upgrade: websocket header' };
  }
  const connection = req.headers['connection']?.toLowerCase() ?? '';
  // Connection is a comma-separated token list; 'upgrade' must appear.
  const tokens = connection.split(',').map((t) => t.trim());
  if (!tokens.includes('upgrade')) {
    return { ok: false, status: 400, reason: 'Connection header lacks "upgrade" token' };
  }
  const key = req.headers['sec-websocket-key'];
  if (!key || key.trim().length === 0) {
    return { ok: false, status: 400, reason: 'missing Sec-WebSocket-Key' };
  }
  // The key must be a 16-byte value, base64-encoded → 24 chars.
  const decoded = Buffer.from(key, 'base64');
  if (decoded.length !== 16) {
    return { ok: false, status: 400, reason: 'Sec-WebSocket-Key is not a 16-byte nonce' };
  }
  const version = req.headers['sec-websocket-version'];
  if (version !== '13') {
    return { ok: false, status: 426, reason: `unsupported WebSocket version ${version ?? '(none)'}` };
  }
  return { ok: true, acceptKey: wsAcceptKey(key), upstreamPath: req.path };
}

/** Build the 101 response headers for an accepted upgrade. */
export function upgradeResponseHeaders(acceptKey: string, protocol?: string): Record<string, string> {
  const h: Record<string, string> = {
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Accept': acceptKey,
  };
  if (protocol) h['Sec-WebSocket-Protocol'] = protocol;
  return h;
}

/* ------------------------------------------------------------------ */
/* Frame codec                                                         */
/* ------------------------------------------------------------------ */

/**
 * Encode a frame. `mask` must be true for client→server direction
 * (RFC 6455 §5.3: the server MUST close on unmasked client frames,
 * and the client MUST mask). A 4-byte mask key is derived from
 * `maskKey` or randomly generated.
 */
export function encodeFrame(frame: WsFrame, mask: boolean, maskKey?: Uint8Array): Uint8Array {
  const len = frame.payload.length;
  let headerSize = 2;
  if (len >= 126 && len <= 0xffff) headerSize += 2;
  else if (len > 0xffff) headerSize += 8;
  const out = new Uint8Array(headerSize + (mask ? 4 : 0) + len);
  out[0] = (frame.fin ? 0x80 : 0x00) | (frame.opcode & 0x0f);

  let offset = 2;
  if (len < 126) {
    out[1] = len;
  } else if (len <= 0xffff) {
    out[1] = 126;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    offset = 4;
  } else {
    out[1] = 127;
    // 64-bit length; we only support up to 2^53 — write high 32 bits
    // then low 32 bits.
    const big = BigInt(len);
    for (let i = 0; i < 8; i++) {
      out[2 + i] = Number((big >> BigInt((7 - i) * 8)) & 0xffn);
    }
    offset = 10;
  }

  if (mask) {
    out[1] = out[1]! | 0x80;
    const key = maskKey ?? randomMaskKey();
    out.set(key, offset);
    offset += 4;
    for (let i = 0; i < len; i++) {
      out[offset + i] = frame.payload[i]! ^ key[i % 4]!;
    }
  } else {
    out.set(frame.payload, offset);
  }
  return out;
}

function randomMaskKey(): Uint8Array {
  const k = new Uint8Array(4);
  // Deterministic-free masking key — Math.random is fine; the mask
  // is not a security boundary, it prevents cache-poisoning only.
  for (let i = 0; i < 4; i++) k[i] = Math.floor(Math.random() * 256);
  return k;
}

/**
 * Incrementally decode as many complete frames as `buf` holds.
 * Client frames are unmasked in place. Protocol violations throw
 * `WsProtocolError` — the relay translates that into a close frame.
 */
export function decodeFrames(buf: Uint8Array, expectMasked?: boolean): WsDecodeResult {
  const frames: WsFrame[] = [];
  let offset = 0;

  while (offset + 2 <= buf.length) {
    const b0 = buf[offset]!;
    const b1 = buf[offset + 1]!;
    const fin = (b0 & 0x80) !== 0;
    const rsv = b0 & 0x70;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let headerLen = 2;

    if (rsv !== 0) {
      throw new WsProtocolError('RSV bits set without negotiated extension');
    }
    if (expectMasked !== undefined && masked !== expectMasked) {
      throw new WsProtocolError(masked ? 'unexpected masked frame' : 'expected masked client frame');
    }
    if (opcode >= 0x8 && !fin) {
      throw new WsProtocolError('control frames must not be fragmented');
    }
    if (opcode >= 0x8 && payloadLen > 125) {
      throw new WsProtocolError('control frame payload exceeds 125 bytes');
    }

    if (payloadLen === 126) {
      if (offset + 4 > buf.length) return { frames, consumed: offset, incomplete: true };
      payloadLen = (buf[offset + 2]! << 8) | buf[offset + 3]!;
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buf.length) return { frames, consumed: offset, incomplete: true };
      let big = 0n;
      for (let i = 0; i < 8; i++) {
        big = (big << 8n) | BigInt(buf[offset + 2 + i]!);
      }
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new WsProtocolError('payload length exceeds MAX_SAFE_INTEGER');
      }
      payloadLen = Number(big);
      headerLen = 10;
    }

    const maskLen = masked ? 4 : 0;
    const total = headerLen + maskLen + payloadLen;
    if (offset + total > buf.length) {
      return { frames, consumed: offset, incomplete: true };
    }

    let payload = buf.slice(offset + headerLen + maskLen, offset + total);
    if (masked) {
      const key = buf.slice(offset + headerLen, offset + headerLen + 4);
      const unmasked = new Uint8Array(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i]! ^ key[i % 4]!;
      }
      payload = unmasked;
    }
    frames.push({ fin, opcode, payload });
    offset += total;
  }

  return { frames, consumed: offset, incomplete: false };
}

/** Protocol violation raised by the decoder. */
export class WsProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WsProtocolError';
  }
}

/** Build a close frame payload: 2-byte code + UTF-8 reason. */
export function closePayload(code: number, reason: string): Uint8Array {
  const reasonBytes = new TextEncoder().encode(reason);
  const out = new Uint8Array(2 + reasonBytes.length);
  out[0] = (code >>> 8) & 0xff;
  out[1] = code & 0xff;
  out.set(reasonBytes, 2);
  return out;
}

/* ------------------------------------------------------------------ */
/* Relay                                                               */
/* ------------------------------------------------------------------ */

/**
 * One proxied connection. Bytes fed from each side are decoded with
 * the direction's masking expectation, run through `hooks.onFrame`,
 * re-encoded with the *opposite* direction's masking convention, and
 * written to the peer endpoint.
 *
 * Control frames are handled at the relay: ping → immediate pong back
 * to the sender; close → echoed to the peer, then both sides close.
 */
export class WsRelay {
  private clientBuf = new Uint8Array(0);
  private upstreamBuf = new Uint8Array(0);
  private closed = false;
  private closeReason: string | undefined;
  private stats = {
    framesClientToUpstream: 0,
    framesUpstreamToClient: 0,
    bytesClientToUpstream: 0,
    bytesUpstreamToClient: 0,
    pings: 0,
    pongs: 0,
  };
  /** Partial message reassembly state per direction. */
  private clientFrag: { opcode: number; parts: Uint8Array[] } | null = null;
  private upstreamFrag: { opcode: number; parts: Uint8Array[] } | null = null;

  constructor(
    private readonly client: WsEndpoint,
    private readonly upstream: WsEndpoint,
    private readonly hooks: WsRelayHooks = {}
  ) {}

  /** Bytes arriving from the downstream client (masked per RFC). */
  feedClient(bytes: Uint8Array): void {
    if (this.closed) return;
    this.stats.bytesClientToUpstream += bytes.length;
    this.clientBuf = concat(this.clientBuf, bytes);
    let decoded: WsDecodeResult;
    try {
      decoded = decodeFrames(this.clientBuf, true);
    } catch (e) {
      this.fail('client protocol error: ' + (e as Error).message);
      return;
    }
    this.clientBuf = new Uint8Array(this.clientBuf.slice(decoded.consumed));
    for (const f of decoded.frames) {
      this.forward(f, 'client→upstream');
      if (this.closed) return;
    }
  }

  /** Bytes arriving from the upstream (unmasked server frames). */
  feedUpstream(bytes: Uint8Array): void {
    if (this.closed) return;
    this.stats.bytesUpstreamToClient += bytes.length;
    this.upstreamBuf = concat(this.upstreamBuf, bytes);
    let decoded: WsDecodeResult;
    try {
      decoded = decodeFrames(this.upstreamBuf, false);
    } catch (e) {
      this.fail('upstream protocol error: ' + (e as Error).message);
      return;
    }
    this.upstreamBuf = new Uint8Array(this.upstreamBuf.slice(decoded.consumed));
    for (const f of decoded.frames) {
      this.forward(f, 'upstream→client');
      if (this.closed) return;
    }
  }

  private forward(frame: WsFrame, direction: 'client→upstream' | 'upstream→client'): void {
    // Handle control frames at the relay.
    if (frame.opcode === WS_OP_PING) {
      this.stats.pings++;
      const sender = direction === 'client→upstream' ? this.client : this.upstream;
      // Pong goes back to the sender, masked per *its* direction.
      sender.send(
        encodeFrame({ fin: true, opcode: WS_OP_PONG, payload: frame.payload }, direction === 'client→upstream')
      );
      return;
    }
    if (frame.opcode === WS_OP_PONG) {
      this.stats.pongs++;
      return; // consumed locally
    }
    if (frame.opcode === WS_OP_CLOSE) {
      const reason = decodeCloseReason(frame.payload);
      // Echo the close to the peer, then shut both sides down.
      const peer = direction === 'client→upstream' ? this.upstream : this.client;
      peer.send(encodeFrame(frame, direction === 'upstream→client'));
      this.closed = true;
      this.closeReason = reason;
      this.client.close();
      this.upstream.close();
      this.hooks.onClose?.(reason);
      return;
    }

    // Data frames: reassemble fragmented messages so the hook sees
    // whole messages, not continuation chunks.
    const frag = direction === 'client→upstream' ? this.clientFrag : this.upstreamFrag;
    if (frame.opcode === WS_OP_CONTINUATION) {
      if (!frag) {
        this.fail('orphan continuation frame');
        return;
      }
      frag.parts.push(frame.payload);
      if (!frame.fin) return;
      const whole: WsFrame = {
        fin: true,
        opcode: frag.opcode,
        payload: concatAll(frag.parts),
      };
      this.setFrag(direction, null);
      this.deliver(whole, direction);
      return;
    }
    if (!frame.fin) {
      // First fragment of a multi-frame message.
      this.setFrag(direction, { opcode: frame.opcode, parts: [frame.payload] });
      return;
    }
    this.deliver(frame, direction);
  }

  private deliver(frame: WsFrame, direction: 'client→upstream' | 'upstream→client'): void {
    // `undefined` (hook absent or returned nothing) means pass through;
    // only an explicit `null` drops the frame.
    const hooked = this.hooks.onFrame?.(frame, direction);
    if (hooked === null) return;
    const inspected = hooked ?? frame;
    const peer = direction === 'client→upstream' ? this.upstream : this.client;
    // Client→upstream frames must be masked (server expects it);
    // upstream→client frames must be unmasked.
    peer.send(encodeFrame(inspected, direction === 'client→upstream'));
    if (direction === 'client→upstream') this.stats.framesClientToUpstream++;
    else this.stats.framesUpstreamToClient++;
  }

  private setFrag(
    direction: 'client→upstream' | 'upstream→client',
    frag: { opcode: number; parts: Uint8Array[] } | null
  ): void {
    if (direction === 'client→upstream') this.clientFrag = frag;
    else this.upstreamFrag = frag;
  }

  /** Protocol failure: send a 1002 close to both sides and tear down. */
  private fail(reason: string): void {
    if (this.closed) return;
    const frame: WsFrame = { fin: true, opcode: WS_OP_CLOSE, payload: closePayload(1002, reason) };
    this.client.send(encodeFrame(frame, false));
    this.upstream.send(encodeFrame(frame, true));
    this.closed = true;
    this.closeReason = reason;
    this.client.close();
    this.upstream.close();
    this.hooks.onClose?.(reason);
  }

  /** Force-close the relay (gateway shutdown, route removed, ...). */
  terminate(reason: string): void {
    if (this.closed) return;
    const frame: WsFrame = { fin: true, opcode: WS_OP_CLOSE, payload: closePayload(1001, reason) };
    this.client.send(encodeFrame(frame, false));
    this.upstream.send(encodeFrame(frame, true));
    this.closed = true;
    this.closeReason = reason;
    this.client.close();
    this.upstream.close();
    this.hooks.onClose?.(reason);
  }

  snapshot(): WsRelayStats {
    return {
      framesClientToUpstream: this.stats.framesClientToUpstream,
      framesUpstreamToClient: this.stats.framesUpstreamToClient,
      bytesClientToUpstream: this.stats.bytesClientToUpstream,
      bytesUpstreamToClient: this.stats.bytesUpstreamToClient,
      pings: this.stats.pings,
      pongs: this.stats.pongs,
      closed: this.closed,
      closeReason: this.closeReason,
    };
  }
}

/** In-memory endpoint for tests and loopback proxying. */
export class InMemoryWsEndpoint implements WsEndpoint {
  readonly sent: Uint8Array[] = [];
  closed = false;
  send(data: Uint8Array): void {
    if (!this.closed) this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  /** All sent bytes concatenated. */
  bytes(): Uint8Array {
    return concatAll(this.sent);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function concatAll(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function decodeCloseReason(payload: Uint8Array): string {
  if (payload.length < 2) return '';
  return new TextDecoder().decode(payload.slice(2));
}

/**
 * Top-level façade: upgrade validation + relay construction.
 */
export class WsProxyEngine {
  evaluateUpgrade = evaluateUpgrade;
  upgradeResponseHeaders = upgradeResponseHeaders;
  encodeFrame = encodeFrame;
  decodeFrames = decodeFrames;

  /** Wire a client endpoint to an upstream endpoint. */
  relay(client: WsEndpoint, upstream: WsEndpoint, hooks?: WsRelayHooks): WsRelay {
    return new WsRelay(client, upstream, hooks);
  }
}
