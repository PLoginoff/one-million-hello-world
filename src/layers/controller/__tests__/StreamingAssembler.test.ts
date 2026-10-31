/**
 * Streaming Response Assembler Tests
 *
 * Covers: mode inference + locking, mixed-mode rejection, raw writes
 * with backpressure, SSE frame emission with retry hints, multipart
 * serialization with closing boundary, and incremental drain.
 */

import { describe, it, expect } from 'bun:test';

import { StreamingResponseAssembler, MixedModeError } from '../engine/StreamingResponseAssembler';

const dec = new TextDecoder();
const bytes = (s: string) => new TextEncoder().encode(s);

function drainAll(a: StreamingResponseAssembler): string {
  return a.drain().map((c) => dec.decode(c)).join('');
}

describe('StreamingResponseAssembler', () => {
  it('raw writes accumulate and drain', () => {
    const a = new StreamingResponseAssembler({ capacity: 1024 });
    a.writeText('hello ');
    a.writeText('world');
    expect(a.mode).toBe('raw');
    expect(drainAll(a)).toBe('hello world');
  });

  it('finish returns the assembled body + content type', () => {
    const a = new StreamingResponseAssembler({ capacity: 1024 });
    a.writeText('payload');
    a.contentType('text/plain');
    const res = a.finish();
    expect(dec.decode(res.body)).toBe('payload');
    expect(res.contentType).toBe('text/plain');
    expect(res.mode).toBe('raw');
  });

  it('writeEvent emits SSE frames and locks mode', () => {
    const a = new StreamingResponseAssembler({ capacity: 1024, sseRetryMs: 2000 });
    a.writeEvent({ data: 'tick', id: '1' });
    expect(a.mode).toBe('sse');
    const text = drainAll(a);
    expect(text).toContain('data: tick');
    expect(text).toContain('retry: 2000');
  });

  it('sse finish infers text/event-stream', () => {
    const a = new StreamingResponseAssembler({ capacity: 1024 });
    a.writeEvent({ data: 'x' });
    const res = a.finish();
    expect(res.contentType).toBe('text/event-stream');
  });

  it('mixed modes throw MixedModeError', () => {
    const a = new StreamingResponseAssembler({ capacity: 1024 });
    a.writeText('raw');
    expect(() => a.writeEvent({ data: 'x' })).toThrow(MixedModeError);
    expect(() => a.writePart({ contentType: 'text/plain', body: 'x' })).toThrow(MixedModeError);
  });

  it('multipart writes emit boundaries + parts + closing marker', () => {
    const a = new StreamingResponseAssembler({ capacity: 4096 });
    a.writePart({ contentType: 'text/plain', body: 'one' });
    a.writePart({ contentType: 'application/json', body: '{"x":1}' });
    const res = a.finish();
    const text = dec.decode(res.body);
    expect(text).toContain('Content-Type: text/plain\r\n\r\none');
    expect(text).toContain('Content-Type: application/json\r\n\r\n{"x":1}');
    expect(text.trimEnd().endsWith('--')).toBe(true);
    expect(res.contentType).toContain('multipart/mixed; boundary=');
    expect(res.mode).toBe('multipart');
  });

  it('backpressure: write returns full at capacity, drain frees space', () => {
    const a = new StreamingResponseAssembler({ capacity: 8 });
    a.writeText('12345678');
    const res = a.writeText('x');
    expect(res.kind).toBe('full');
    a.drain();
    expect(a.writeText('x').kind).toBe('accepted');
  });

  it('writes after finish are rejected', () => {
    const a = new StreamingResponseAssembler({ capacity: 64 });
    a.writeText('x');
    a.finish();
    expect(a.writeText('y').kind).toBe('closed');
  });

  it('heartbeat emits a comment frame', () => {
    const a = new StreamingResponseAssembler({ capacity: 512 });
    a.heartbeat('keep-alive');
    expect(drainAll(a)).toContain(': keep-alive');
  });
});
