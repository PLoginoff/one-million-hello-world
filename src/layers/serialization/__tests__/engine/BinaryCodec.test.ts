/**
 * Serialization Engine tests
 *
 * Covers: binary codec round-trips across types, compactness vs JSON,
 * schema-aware positional encoding, streaming partial-buffer handling,
 * versioned envelopes + CRC integrity, and randomized round-trip fuzzing.
 */

import { describe, it, expect } from 'bun:test';

import {
  BinaryCodec,
  SchemaCodec,
  StreamDecoder,
  encodeFrame,
  PayloadEnvelope,
  ContentTypeId,
  EnvelopeError,
  CodecError,
  crc32,
} from '../../engine';

// --------------------------------------------------------------------------

describe('BinaryCodec round-trips', () => {
  const codec = new BinaryCodec();

  const cases: [string, unknown][] = [
    ['null', null],
    ['booleans', true],
    ['small int', 42],
    ['large int', Number.MAX_SAFE_INTEGER],
    ['negative int', -12345],
    ['float', 3.14159],
    ['empty string', ''],
    ['unicode string', 'héllo wörld ✓ '],
    ['nested array', [1, 'two', [3, [4]], null]],
    ['nested map', { a: 1, b: { c: [true, false] }, d: 'x' }],
    ['bytes', new Uint8Array([1, 2, 3, 255])],
  ];

  for (const [name, value] of cases) {
    it(`round-trips ${name}`, () => {
      const encoded = codec.encode(value);
      expect(codec.decode(encoded)).toEqual(value);
    });
  }

  it('drops undefined object fields like JSON does', () => {
    const out = codec.decode(codec.encode({ a: 1, b: undefined })) as Record<string, unknown>;
    expect(out).toEqual({ a: 1 });
  });

  it('is more compact than JSON for small-int-heavy data', () => {
    const doc = { id: 7, age: 33, tags: [1, 2, 3, 4, 5] };
    const bin = codec.encode(doc).length;
    const json = new TextEncoder().encode(JSON.stringify(doc)).length;
    expect(bin).toBeLessThan(json);
  });

  it('rejects unknown tags', () => {
    expect(() => codec.decode(new Uint8Array([0xfe]))).toThrow(CodecError);
  });
});

// --------------------------------------------------------------------------

describe('SchemaCodec', () => {
  const schema = {
    name: 'user',
    version: 2,
    fields: [
      { name: 'id', kind: 'integer', required: true },
      { name: 'name', kind: 'string' },
      { name: 'active', kind: 'boolean' },
    ],
  } as const;

  it('encodes positional records without field names', () => {
    const c = new SchemaCodec().compile(schema);
    const bin = c.encode('user', { id: 7, name: 'ann', active: true });
    const out = c.decode('user', bin);
    expect(out).toEqual({ id: 7, name: 'ann', active: true });
    // No 'name'/'active' field names on the wire.
    const asStr = new TextDecoder().decode(bin);
    expect(asStr).not.toContain('active');
  });

  it('validates required fields on encode', () => {
    const c = new SchemaCodec().compile(schema);
    expect(() => c.encode('user', { name: 'x' } as Record<string, unknown>)).toThrow(CodecError);
  });

  it('validates field kinds', () => {
    const c = new SchemaCodec().compile(schema);
    expect(() => c.encode('user', { id: 'seven' } as unknown as Record<string, unknown>)).toThrow(
      CodecError
    );
  });

  it('rejects newer versions than compiled', () => {
    const c = new SchemaCodec().compile(schema);
    const bin = c.encode('user', { id: 1 });
    // Forge a v3 record by bumping the leading varint.
    bin[0] = 3;
    expect(() => c.decode('user', bin)).toThrow(CodecError);
  });
});

// --------------------------------------------------------------------------

describe('StreamDecoder', () => {
  it('reassembles records split across chunk boundaries', () => {
    const codec = new BinaryCodec();
    const records = [{ a: 1 }, [1, 2, 3], 'hello', 42, null];
    const wire = concat(records.map((r) => encodeFrame(r)));

    const dec = new StreamDecoder({ mode: 'frame' });
    const out: unknown[] = [];
    // Feed byte-by-byte — worst-case fragmentation.
    for (const b of wire) {
      out.push(...dec.feed(new Uint8Array([b])));
    }
    out.push(...dec.finish());
    expect(out).toEqual(records);
  });

  it('raw mode decodes self-describing values without framing', () => {
    const codec = new BinaryCodec();
    const wire = concat([codec.encode({ x: 1 }), codec.encode([2]), codec.encode('s')]);
    const dec = new StreamDecoder({ mode: 'raw' });
    const out = dec.feed(wire);
    expect(out).toEqual([{ x: 1 }, [2], 's']);
  });

  it('finish() throws on a truncated tail', () => {
    const dec = new StreamDecoder({ mode: 'frame' });
    dec.feed(new Uint8Array([10, 1, 2])); // frame claims 10 bytes, only 2 arrive
    expect(() => dec.finish()).toThrow(/truncated/i);
  });
});

// --------------------------------------------------------------------------

describe('PayloadEnvelope', () => {
  it('wraps and unwraps with CRC verification', () => {
    const codec = new BinaryCodec();
    const payload = codec.encode({ msg: 'hi' });
    const env = PayloadEnvelope.wrap(ContentTypeId.BINARY_CODEC, payload);
    const un = PayloadEnvelope.unwrap(env);
    expect(un.contentType).toBe(ContentTypeId.BINARY_CODEC);
    expect(codec.decode(un.payload)).toEqual({ msg: 'hi' });
  });

  it('rejects corrupt payloads via CRC', () => {
    const codec = new BinaryCodec();
    const env = PayloadEnvelope.wrap(ContentTypeId.BINARY_CODEC, codec.encode({ a: 1 }));
    env[env.length - 6] ^= 0xff; // flip a payload byte (before CRC)
    expect(() => PayloadEnvelope.unwrap(env)).toThrow(EnvelopeError);
  });

  it('rejects bad magic and unsupported versions', () => {
    expect(() => PayloadEnvelope.unwrap(new Uint8Array([0, 0, 1, 1, 0, 0]))).toThrow(/magic/i);
    const env = PayloadEnvelope.wrap(ContentTypeId.JSON_UTF8, new Uint8Array([1]));
    env[2] = 99; // future codec version
    expect(() => PayloadEnvelope.unwrap(env)).toThrow(/version/i);
  });

  it('crc32 is stable across calls', () => {
    expect(crc32(new Uint8Array([1, 2, 3]))).toBe(crc32(new Uint8Array([1, 2, 3])));
  });
});

// --------------------------------------------------------------------------

describe('Fuzz — BinaryCodec vs JSON codec', () => {
  // Deterministic LCG so failures reproduce.
  let seed = 0x12345678;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  function randomValue(depth: number): unknown {
    const r = rand();
    if (depth <= 0 || r < 0.3) {
      const p = rand();
      if (p < 0.2) return null;
      if (p < 0.4) return rand() < 0.5;
      if (p < 0.6) return Math.floor(rand() * 1e6) - 5e5;
      if (p < 0.8) return rand() * 1e4;
      return `s${Math.floor(rand() * 1e6)}`;
    }
    if (r < 0.65) {
      return Array.from({ length: Math.floor(rand() * 5) }, () => randomValue(depth - 1));
    }
    const o: Record<string, unknown> = {};
    const n = Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) o[`k${i}`] = randomValue(depth - 1);
    return o;
  }

  it('round-trips 500 random structures identically to JSON', () => {
    const codec = new BinaryCodec();
    for (let i = 0; i < 500; i++) {
      const v = randomValue(4);
      const jsonRound = JSON.parse(JSON.stringify(v));
      const binRound = codec.decode(codec.encode(v));
      expect(binRound).toEqual(jsonRound);
    }
  });

  it('frames round-trip through StreamDecoder for 200 random values', () => {
    const dec = new StreamDecoder({ mode: 'frame' });
    const expected: unknown[] = [];
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < 200; i++) {
      const v = randomValue(3);
      expected.push(JSON.parse(JSON.stringify(v)));
      chunks.push(encodeFrame(v));
    }
    const wire = concat(chunks);
    const out: unknown[] = [];
    // Random-size chunks.
    let off = 0;
    while (off < wire.length) {
      const n = 1 + Math.floor(rand() * 50);
      out.push(...dec.feed(wire.slice(off, off + n)));
      off += n;
    }
    out.push(...dec.finish());
    expect(out).toEqual(expected);
  });
});

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
