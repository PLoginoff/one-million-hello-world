/**
 * FieldEncryptor — per-field encryption for records/objects.
 *
 * Selectively encrypts values at given paths so the rest of the record
 * remains queryable. Each encrypted field carries its own envelope and
 * the record's primary key as AAD (binding the ciphertext to its row).
 */

import { KeyRing, WrappedRecord } from './KeyRing';
import { CryptoError } from './types';

export interface EncryptedFieldValue {
  __enc: true;
  /** Serialised WrappedRecord. */
  wrapped: string; // base64 of JSON
  kekKid: string;
}

export type FieldSpec = {
  /** Dot-separated path e.g. "user.ssn" or "card.number". */
  path: string;
  /** Optional explicit AAD. Defaults to `${recordId}:${path}`. */
  aad?: string;
};

function isEncryptedFieldValue(v: unknown): v is EncryptedFieldValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as EncryptedFieldValue).__enc === true &&
    typeof (v as EncryptedFieldValue).wrapped === 'string'
  );
}

export class FieldEncryptor {
  constructor(private readonly ring: KeyRing) {}

  /**
   * Encrypt the given fields in a record. Returns a new record — the
   * input is not mutated.
   */
  encryptFields<T extends Record<string, unknown>>(
    record: T,
    fields: FieldSpec[],
    opts: { recordId?: string } = {}
  ): T {
    const out = structuredCloneRecord(record);
    for (const spec of fields) {
      const path = spec.path;
      const current = this.getPath(out, path);
      if (current === undefined) continue;
      if (isEncryptedFieldValue(current)) continue; // already encrypted
      const aad = spec.aad ?? `${opts.recordId ?? 'rec'}:${path}`;
      const pt = Buffer.from(JSON.stringify(current), 'utf8');
      const rec = this.ring.seal(pt, { aad });
      const enc: EncryptedFieldValue = {
        __enc: true,
        wrapped: Buffer.from(JSON.stringify(rec), 'utf8').toString('base64'),
        kekKid: rec.kekKid,
      };
      this.setPath(out, path, enc);
    }
    return out;
  }

  /**
   * Decrypt the given fields in-place on a cloned record.
   */
  decryptFields<T extends Record<string, unknown>>(
    record: T,
    fields: FieldSpec[],
    opts: { recordId?: string } = {}
  ): T {
    const out = structuredCloneRecord(record);
    for (const spec of fields) {
      const path = spec.path;
      const current = this.getPath(out, path);
      if (!isEncryptedFieldValue(current)) continue;
      const aad = spec.aad ?? `${opts.recordId ?? 'rec'}:${path}`;
      let wrapped: WrappedRecord;
      try {
        wrapped = JSON.parse(Buffer.from(current.wrapped, 'base64').toString('utf8')) as WrappedRecord;
      } catch (err) {
        throw new CryptoError('invalid_format', `Wrapped record is not JSON: ${(err as Error).message}`);
      }
      const pt = this.ring.open(wrapped, { aad });
      const val = JSON.parse(pt.toString('utf8')) as unknown;
      this.setPath(out, path, val);
    }
    return out;
  }

  /** Re-wrap fields under the current KEK (rotation). */
  rotateFields<T extends Record<string, unknown>>(
    record: T,
    fields: FieldSpec[]
  ): T {
    const out = structuredCloneRecord(record);
    for (const spec of fields) {
      const current = this.getPath(out, spec.path);
      if (!isEncryptedFieldValue(current)) continue;
      const wrapped = JSON.parse(
        Buffer.from(current.wrapped, 'base64').toString('utf8')
      ) as WrappedRecord;
      const rewrapped = this.ring.rewrap(wrapped);
      const enc: EncryptedFieldValue = {
        __enc: true,
        wrapped: Buffer.from(JSON.stringify(rewrapped), 'utf8').toString('base64'),
        kekKid: rewrapped.kekKid,
      };
      this.setPath(out, spec.path, enc);
    }
    return out;
  }

  /* ---------------------------------------------------------------- */

  private getPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
      if (typeof cur !== 'object' || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }

  private setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const next = cur[p];
      if (typeof next !== 'object' || next === null) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  }
}

/** Deep clone for plain JSON-shaped records. */
function structuredCloneRecord<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
