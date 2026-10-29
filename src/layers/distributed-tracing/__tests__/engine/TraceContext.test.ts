/**
 * W3C traceparent parse/build tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  buildTraceparent,
  childContext,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
  tryParseTraceparent,
} from '../../engine/trace-context';

const VALID = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

describe('parseTraceparent', () => {
  it('parses a valid header', () => {
    const ctx = parseTraceparent(VALID);
    expect(ctx.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx.parentId).toBe('b7ad6b7169203331');
    expect(ctx.sampled).toBe(true);
    expect(ctx.version).toBe(0);
  });

  it('parses non-sampled flag', () => {
    const ctx = parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00');
    expect(ctx.sampled).toBe(false);
  });

  it('rejects malformed headers', () => {
    expect(() => parseTraceparent('')).toThrow();
    expect(() => parseTraceparent('garbage')).toThrow();
    expect(() => parseTraceparent('00-abc-def-01')).toThrow();
    // Uppercase hex is invalid per spec.
    expect(() =>
      parseTraceparent('00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-01')
    ).toThrow();
  });

  it('rejects all-zero ids', () => {
    expect(() =>
      parseTraceparent(`00-${'0'.repeat(32)}-b7ad6b7169203331-01`)
    ).toThrow(/zeros/);
    expect(() =>
      parseTraceparent(`00-0af7651916cd43dd8448eb211c80319c-${'0'.repeat(16)}-01`)
    ).toThrow(/zeros/);
  });

  it('rejects version ff', () => {
    expect(() =>
      parseTraceparent('ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')
    ).toThrow(/ff/);
  });

  it('tryParseTraceparent returns undefined for bad input', () => {
    expect(tryParseTraceparent('junk')).toBeUndefined();
    expect(tryParseTraceparent(undefined)).toBeUndefined();
    expect(tryParseTraceparent(null)).toBeUndefined();
    expect(tryParseTraceparent(VALID)).toBeDefined();
  });
});

describe('buildTraceparent', () => {
  it('round-trips with parse', () => {
    const ctx = parseTraceparent(VALID);
    expect(buildTraceparent(ctx)).toBe(VALID);
  });

  it('emits 00 flag when unsampled', () => {
    const out = buildTraceparent({
      traceId: 'a'.repeat(32),
      parentId: 'b'.repeat(16),
      sampled: false,
    });
    expect(out.endsWith('-00')).toBe(true);
  });
});

describe('childContext', () => {
  it('keeps trace id and updates parent id', () => {
    const ctx = parseTraceparent(VALID);
    const child = childContext(ctx, 'c'.repeat(16));
    expect(child.traceId).toBe(ctx.traceId);
    expect(child.parentId).toBe('c'.repeat(16));
    expect(child.sampled).toBe(ctx.sampled);
  });
});

describe('id generation', () => {
  it('trace ids are 32 lowercase hex, non-zero', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toBe('0'.repeat(32));
    }
  });

  it('span ids are 16 lowercase hex, non-zero', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
      expect(id).not.toBe('0'.repeat(16));
    }
  });
});
