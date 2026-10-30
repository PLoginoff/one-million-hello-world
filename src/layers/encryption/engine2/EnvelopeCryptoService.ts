/**
 * Envelope Crypto Service — facade tying hierarchy + shredder + index.
 *
 * The three engine2 primitives are powerful but disjoint; real usage
 * wants them fused:
 *
 *   encryptRecord(scope, { email, ssn }) →
 *     1. encrypt each sensitive field under the scope's DEK (hierarchy)
 *     2. blind-index the searchable ones (index)
 *     3. track each ciphertext handle (shredder)
 *     4. audit every op (audit)
 *
 *   forgetSubject(scope) → one call = crypto-shred all DEKs for the
 *   subject + audit the erasure.
 *
 * Field spec: which paths are encrypted, which are also searchable, and
 * which stay plaintext — the declaration a schema would carry.
 *
 * @module EncryptionLayer/Engine2
 */

import { EncryptedEnvelope } from '../crypto/types';
import { BlindIndexService } from './BlindIndex';
import { CryptoShredder } from './CryptoShredder';
import { KeyHierarchy } from './KeyHierarchy';
import { KeyUsageAudit } from './KeyUsageAudit';
import { IClock, ShredResult, SystemClock } from './types';

/** Per-field encryption + searchability declaration. */
export interface FieldPolicy {
  /** Dot path in the record ("contact.email"). */
  readonly path: string;
  /** Encrypt this field. */
  readonly encrypt: boolean;
  /** Maintain a blind index for equality search (requires encrypt). */
  readonly searchable?: boolean;
  /** Blind-index normaliser (see BlindIndexService). */
  readonly normalizer?: string;
}

export interface CryptoServiceConfig {
  readonly clock?: IClock;
}

/** Result of encrypting one record. */
export interface SecuredRecord {
  /** The record with encrypted fields replaced by envelopes. */
  readonly record: Record<string, unknown>;
  /** field-path → blind-index tag (for the searchable fields). */
  readonly tags: Readonly<Record<string, string>>;
  /** Handles tracked for shredding — one per encrypted field. */
  readonly handles: readonly string[];
}

export class EnvelopeCryptoService {
  private readonly _hierarchy: KeyHierarchy;
  private readonly _shredder: CryptoShredder;
  private readonly _index: BlindIndexService;
  private readonly _audit: KeyUsageAudit;
  private readonly _clock: IClock;
  /** scope → policies, for callers that register policies once. */
  private readonly _policies = new Map<string, FieldPolicy[]>();
  private _handleSeq = 0;

  constructor(masterKey: Buffer, masterId = 'master-0', config: CryptoServiceConfig = {}) {
    this._clock = config.clock ?? new SystemClock();
    this._audit = new KeyUsageAudit({}, this._clock);
    this._hierarchy = new KeyHierarchy({ clock: this._clock, audit: this._audit });
    this._hierarchy.setMasterKey(masterKey, masterId);
    this._shredder = new CryptoShredder(this._hierarchy, this._audit, this._clock);
    this._index = new BlindIndexService({ clock: this._clock, audit: this._audit });
  }

  /** Register a field policy for a scope + create needed blind indexes. */
  definePolicy(scope: string, policies: readonly FieldPolicy[]): void {
    this._policies.set(scope, [...policies]);
    for (const p of policies) {
      if (p.searchable) {
        const field = `${scope}:${p.path}`;
        try {
          this._index.createIndex(field, p.normalizer ?? 'lowercase');
        } catch {
          // index exists — idempotent
        }
      }
    }
  }

  /**
   * Apply a scope's policy to a record: encrypt declared fields, produce
   * blind tags for searchable ones, track handles for shredding.
   */
  secureRecord(scope: string, record: Record<string, unknown>): SecuredRecord {
    const policies = this._requirePolicy(scope);
    const out = structuredCloneSafe(record);
    const tags: Record<string, string> = {};
    const handles: string[] = [];

    for (const p of policies) {
      if (!p.encrypt) continue;
      const value = getPath(out, p.path);
      if (value === undefined) continue;
      const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
      const handle = `${scope}:${p.path}:${this._clock.now()}:${++this._handleSeq}`;
      const env = this._shredder.encryptTracked(scope, plaintext, handle, `${scope}:${p.path}`);
      setPath(out, p.path, env);
      handles.push(handle);
      if (p.searchable) {
        const field = `${scope}:${p.path}`;
        tags[p.path] = this._index.tag(field, plaintext);
      }
    }
    return { record: out, tags, handles };
  }

  /** Decrypt one field's envelope back to plaintext. */
  reveal(envelope: EncryptedEnvelope, target = ''): string {
    return this._hierarchy.decrypt(envelope, target);
  }

  /**
   * Equality-search tag for a plaintext value on a scope+field — the
   * query side of blind indexing.
   */
  searchTag(scope: string, path: string, plaintext: string): string {
    return this._index.tag(`${scope}:${path}`, plaintext);
  }

  /**
   * Crypto-shred a whole scope — GDPR erasure. Every ciphertext produced
   * under the scope's DEKs becomes undecryptable; returns per-key results.
   */
  forgetScope(scope: string, reason = 'subject-erasure'): ShredResult[] {
    return this._shredder.shredScope(scope, reason);
  }

  /** Accessors for the composed engines (dashboards, tests). */
  hierarchy(): KeyHierarchy {
    return this._hierarchy;
  }
  shredder(): CryptoShredder {
    return this._shredder;
  }
  index(): BlindIndexService {
    return this._index;
  }
  audit(): KeyUsageAudit {
    return this._audit;
  }

  /* ---------------------------------------------------------------- */

  private _requirePolicy(scope: string): FieldPolicy[] {
    const p = this._policies.get(scope);
    if (!p) throw new Error(`no field policy registered for scope "${scope}"`);
    return p;
  }
}

/* ---- path helpers -------------------------------------------------- */

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    if (typeof next !== 'object' || next === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function structuredCloneSafe<T>(v: T): T {
  // structuredClone rejects functions/symbols — JSON clone for plain data.
  return JSON.parse(JSON.stringify(v)) as T;
}
