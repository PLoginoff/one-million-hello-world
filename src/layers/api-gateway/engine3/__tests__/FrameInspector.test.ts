/**
 * Tests for FrameInspector: UTF-8 validation, size caps, opcode
 * allowlists and rate limiting.
 */

import { describe, it, expect } from 'bun:test';
import { FrameInspector, utf8ValidateChunk } from '../FrameInspector';
import { WS_OP_TEXT, WS_OP_BINARY, WS_OP_PING, WS_OP_CLOSE, WS_OP_CONTINUATION } from '../types3';

const enc = new TextEncoder();

const frame = (opcode: number, payload: string | Uint8Array, fin = true) => ({
  fin,
  opcode,
  payload: typeof payload === 'string' ? enc.encode(payload) : payload,
});

describe('utf8ValidateChunk', () => {
  it('accepts ASCII', () => {
    expect(utf8ValidateChunk(enc.encode('hello'), { remaining: 0 }).ok).toBe(true);
  });

  it('accepts multi-byte codepoints', () => {
    const euro = enc.encode('€'); // 3-byte E2 82 AC
    const r = utf8ValidateChunk(euro, { remaining: 0 });
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(0);
  });

  it('carries partial sequences across chunks', () => {
    const euro = enc.encode('€');
    const c1 = utf8ValidateChunk(euro.slice(0, 2), { remaining: 0 });
    expect(c1.ok).toBe(true);
    expect(c1.pending).toBe(1);
    const c2 = utf8ValidateChunk(euro.slice(2), { remaining: c1.pending });
    expect(c2.ok).toBe(true);
    expect(c2.pending).toBe(0);
  });

  it('rejects stray continuation and overlong encodings', () => {
    expect(utf8ValidateChunk(new Uint8Array([0x80]), { remaining: 0 }).ok).toBe(false);
    expect(utf8ValidateChunk(new Uint8Array([0xc0, 0x80]), { remaining: 0 }).ok).toBe(false);
    expect(utf8ValidateChunk(new Uint8Array([0xf5]), { remaining: 0 }).ok).toBe(false);
  });
});

describe('FrameInspector', () => {
  it('passes control frames regardless of policy', () => {
    const i = new FrameInspector({ allowedDataOpcodes: [] });
    expect(i.inspect(frame(WS_OP_PING, 'p'), 'client→upstream').action).toBe('pass');
    expect(i.inspect(frame(WS_OP_CLOSE, ''), 'upstream→client').action).toBe('pass');
  });

  it('closes on invalid UTF-8 text with 1007', () => {
    const i = new FrameInspector();
    const v = i.inspect(frame(WS_OP_TEXT, new Uint8Array([0xff, 0xfe])), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1007, reason: 'invalid UTF-8 in text frame' });
  });

  it('does not UTF-8-check binary frames', () => {
    const i = new FrameInspector();
    const v = i.inspect(frame(WS_OP_BINARY, new Uint8Array([0xff, 0xfe])), 'client→upstream');
    expect(v.action).toBe('pass');
  });

  it('enforces per-message size across fragments', () => {
    const i = new FrameInspector({ maxMessageBytes: 10 });
    expect(i.inspect(frame(WS_OP_TEXT, 'abcde', false), 'client→upstream').action).toBe('pass');
    const v = i.inspect(frame(WS_OP_CONTINUATION, 'fghijk'), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1009, reason: 'message exceeds max size' });
  });

  it('enforces per-frame size cap', () => {
    const i = new FrameInspector({ maxFrameBytes: 3 });
    const v = i.inspect(frame(WS_OP_TEXT, 'toolong'), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1009, reason: 'frame exceeds max size' });
  });

  it('opcode allowlist rejects disallowed data opcodes with 1003', () => {
    const i = new FrameInspector({ allowedDataOpcodes: [WS_OP_TEXT] });
    expect(i.inspect(frame(WS_OP_TEXT, 'ok'), 'client→upstream').action).toBe('pass');
    const v = i.inspect(frame(WS_OP_BINARY, new Uint8Array([1])), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1003, reason: 'opcode not permitted' });
  });

  it('orphan continuation is a 1002 protocol close', () => {
    const i = new FrameInspector();
    const v = i.inspect(frame(WS_OP_CONTINUATION, 'x'), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1002, reason: 'orphan continuation' });
  });

  it('rate limiting drops excess completed messages', () => {
    let t = 0;
    const i = new FrameInspector({ maxMessagesPerSecond: 2 }, () => t);
    expect(i.inspect(frame(WS_OP_TEXT, 'a'), 'client→upstream').action).toBe('pass');
    expect(i.inspect(frame(WS_OP_TEXT, 'b'), 'client→upstream').action).toBe('pass');
    const v = i.inspect(frame(WS_OP_TEXT, 'c'), 'client→upstream');
    expect(v.action).toBe('drop');
    // Advance one second — bucket refills.
    t = 1000;
    expect(i.inspect(frame(WS_OP_TEXT, 'd'), 'client→upstream').action).toBe('pass');
  });

  it('directions have independent rate buckets', () => {
    const i = new FrameInspector({ maxMessagesPerSecond: 1 }, () => 0);
    i.inspect(frame(WS_OP_TEXT, 'a'), 'client→upstream');
    const up = i.inspect(frame(WS_OP_TEXT, 'b'), 'upstream→client');
    expect(up.action).toBe('pass'); // separate bucket
  });

  it('truncated UTF-8 at FIN closes 1007', () => {
    const i = new FrameInspector();
    const euro = enc.encode('€');
    expect(
      i.inspect(frame(WS_OP_TEXT, euro.slice(0, 2), false), 'client→upstream').action
    ).toBe('pass');
    const v = i.inspect(frame(WS_OP_CONTINUATION, new Uint8Array(0), true), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1007, reason: 'truncated UTF-8 sequence' });
  });

  it('interleaved message start during a fragment is a 1002 close', () => {
    const i = new FrameInspector();
    i.inspect(frame(WS_OP_TEXT, 'part', false), 'client→upstream');
    const v = i.inspect(frame(WS_OP_TEXT, 'new', false), 'client→upstream');
    expect(v).toEqual({ action: 'close', code: 1002, reason: 'interleaved message start' });
  });

  it('reset clears direction state', () => {
    const i = new FrameInspector({ maxMessagesPerSecond: 1 }, () => 0);
    i.inspect(frame(WS_OP_TEXT, 'a'), 'client→upstream');
    i.reset();
    expect(i.inspect(frame(WS_OP_TEXT, 'b'), 'client→upstream').action).toBe('pass');
  });
});
