/**
 * SchemaCodec — schema-aware encoding with pre-computed field indices.
 *
 * The self-describing `BinaryCodec` writes every field name per record —
 * wasteful when the shape is fixed. SchemaCodec compiles a `FieldSpec[]`
 * (name + type) into a reusable encoder/decoder that:
 *
 *   - writes a field ORDER map once (fields emitted in declared order, so
 *     no per-field names on the wire — just tag+value)
 *   - emits a varint field-count + optional schema version up front
 *   - validates on encode (type mismatch fails fast, not at decode)
 *
 * Wire layout per record:
 *   varint schemaVersion | varint fieldCount | field values in declared
 *   order, each self-describing via BinaryCodec's value tags.
 *
 * Extra fields NOT in the schema are dropped (schema is authoritative —
 * same contract as protobuf field numbers: unknown fields can't be
 * interpreted anyway).
 *
 * Complexity: encode O(declared fields); decode O(declared fields) —
 * no field-name hashing per record.
 *
 * @module SerializationLayer/Engine
 */

import { BinaryCodec, CodecError } from './BinaryCodec';
import { ByteReader, ByteWriter } from './ByteWriter';

export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'bytes' | 'any';

export interface FieldSpec {
  readonly name: string;
  readonly kind: FieldKind;
  /** When true, `undefined` on encode is an error; absent on decode → undefined. */
  readonly required?: boolean;
}

export interface SchemaDef {
  readonly name: string;
  readonly version: number;
  readonly fields: readonly FieldSpec[];
}

/** A compiled schema: field indices pre-resolved for O(1) access. */
interface CompiledField {
  readonly spec: FieldSpec;
  /** Position in the declared order — the wire position. */
  readonly index: number;
}

export class SchemaCodec {
  private readonly binary = new BinaryCodec();
  private readonly schemas = new Map<string, CompiledField[]>();
  private readonly versions = new Map<string, number>();

  /** Compiles a schema once; reused for every encode/decode. */
  compile(def: SchemaDef): this {
    const compiled = def.fields.map((spec, index) => ({ spec, index }));
    this.schemas.set(def.name, compiled);
    this.versions.set(def.name, def.version);
    return this;
  }

  /** Encodes `obj` against `schemaName` — fields emitted in declared order. */
  encode(schemaName: string, obj: Record<string, unknown>): Uint8Array {
    const fields = this.mustSchema(schemaName);
    const w = new ByteWriter(64);
    w.varint(this.versions.get(schemaName) as number);
    // fieldCount = schema arity (fixed shape — absent optionals still emit
    // a NULL tag so positional decoding stays aligned).
    w.varint(fields.length);
    for (const { spec } of fields) {
      const v = obj[spec.name];
      if (v === undefined || v === null) {
        if (spec.required && v === undefined) {
          throw new CodecError(`Missing required field "${spec.name}"`, 0);
        }
        w.u8(0x00); // NULL tag — keeps positional alignment
        continue;
      }
      this.checkKind(spec, v);
      // Delegate the value encoding to the binary codec's writer — write
      // into our own writer by encoding to bytes then appending.
      const encoded = this.binary.encode(v);
      w.bytes(encoded);
    }
    return w.finish();
  }

  /** Decodes a record written by `encode`. Unknown trailing bytes ignored. */
  decode(schemaName: string, buf: Uint8Array): Record<string, unknown> {
    const fields = this.mustSchema(schemaName);
    const r = new ByteReader(buf);
    const version = r.varint();
    const count = r.varint();
    if (version > (this.versions.get(schemaName) as number)) {
      throw new CodecError(
        `Schema "${schemaName}" v${version} newer than compiled v${this.versions.get(schemaName)}`,
        r.offset
      );
    }
    const out: Record<string, unknown> = {};
    const n = Math.min(count, fields.length);
    for (let i = 0; i < n; i++) {
      const res = this.binary.tryRead(r);
      if (!res.ok) {
        // Buffer ended mid-record — positional format must not be truncated.
        throw new CodecError(`Truncated record for schema "${schemaName}"`, r.offset);
      }
      out[fields[i].spec.name] = res.value;
    }
    return out;
  }

  /** Version a schema was compiled at. */
  versionOf(schemaName: string): number {
    const v = this.versions.get(schemaName);
    if (v === undefined) throw new CodecError(`Unknown schema "${schemaName}"`, 0);
    return v;
  }

  private mustSchema(name: string): CompiledField[] {
    const s = this.schemas.get(name);
    if (!s) throw new CodecError(`Schema "${name}" not compiled`, 0);
    return s;
  }

  private checkKind(spec: FieldSpec, v: unknown): void {
    const ok =
      spec.kind === 'any' ||
      (spec.kind === 'string' && typeof v === 'string') ||
      (spec.kind === 'number' && typeof v === 'number') ||
      (spec.kind === 'integer' && typeof v === 'number' && Number.isInteger(v)) ||
      (spec.kind === 'boolean' && typeof v === 'boolean') ||
      (spec.kind === 'bytes' && v instanceof Uint8Array);
    if (!ok) {
      throw new CodecError(
        `Field "${spec.name}": expected ${spec.kind}, got ${typeof v}`,
        0
      );
    }
  }
}
