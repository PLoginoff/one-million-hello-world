/**
 * Secrets Layer — Versioned In-Memory Provider
 *
 * A SecretProvider keeping every version of every path, with values held
 * AES-GCM encrypted at rest (see EncryptedStore). Implements:
 *
 *   - Versioned reads: `get` (latest) and `getVersion` (pinned). Reading a
 *     superseded version is allowed during its grace window; afterwards it
 *     throws VERSION_EXPIRED (the ciphertext is also dropped, so expiry is
 *     enforced, not just reported).
 *   - Graceful rotation: `put` bumps the version and stamps the previous
 *     latest version with `expiresAt = now + gracePeriodMs`. Consumers
 *     holding an old version keep working through the window.
 *   - Wildcard listing: `list(pattern)` with `*`/`**` semantics shared with
 *     the config layer.
 *
 * Path grammar: segments separated by `/` (like Vault: `kv/db/password`).
 * Empty segments and `.`/`..` are rejected to keep wildcard matching sane.
 *
 * @module Secrets/Vault
 */

import { pathPatternToRegex } from '../../configuration/engine/SecretMasker';
import { EncryptedStore } from './EncryptedStore';
import {
  SecretError,
  SecretErrorCode,
  SecretProvider,
  SecretRead,
  SecretVersion,
  SecretsClock,
} from './SecretTypes';

export interface VersionedProviderOptions {
  /** Grace window after a version is superseded (default 300_000 = 5min). */
  readonly gracePeriodMs?: number;
  /** Max retained versions per path; older ones are pruned on put (0 = keep all). */
  readonly maxVersionsPerPath?: number;
  readonly clock?: SecretsClock;
  /** Optional pre-built encrypted store (share across providers). */
  readonly store?: EncryptedStore;
}

interface PathRecord {
  /** Version number → envelope id inside the EncryptedStore. */
  readonly versions: Map<number, string>;
  /** Version metadata (never the plaintext). */
  readonly meta: Map<number, SecretVersion>;
  nextVersion: number;
}

function validatePath(path: string): void {
  if (path === '' || path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    throw new SecretError(SecretErrorCode.INVALID_PATH, `invalid secret path '${path}'`);
  }
  for (const seg of path.split('/')) {
    if (seg === '.' || seg === '..') {
      throw new SecretError(SecretErrorCode.INVALID_PATH, `invalid segment '${seg}' in '${path}'`);
    }
  }
}

/** Wildcards over `/`-separated paths — reuse the dot-grammar regex by
 *  mapping `/` → `.` on both pattern and candidate. */
function pathRegex(pattern: string): RegExp {
  return pathPatternToRegex(pattern.split('/').join('.'));
}

export class VersionedSecretProvider implements SecretProvider {
  readonly name = 'versioned-memory';
  private readonly _clock: SecretsClock;
  private readonly _graceMs: number;
  private readonly _maxVersions: number;
  private readonly _store: EncryptedStore;
  private readonly _paths = new Map<string, PathRecord>();
  private _envelopeSeq = 0;

  constructor(options: VersionedProviderOptions = {}) {
    this._clock = options.clock ?? Date.now;
    this._graceMs = options.gracePeriodMs ?? 300_000;
    this._maxVersions = options.maxVersionsPerPath ?? 0;
    this._store = options.store ?? new EncryptedStore(undefined, 'secrets-master', this._clock);
  }

  get store(): EncryptedStore {
    return this._store;
  }

  async get(path: string): Promise<SecretRead | undefined> {
    validatePath(path);
    const rec = this._paths.get(path);
    if (!rec || rec.versions.size === 0) return undefined;
    const latest = Math.max(...rec.versions.keys());
    return this._read(path, rec, latest);
  }

  async getVersion(path: string, version: number): Promise<SecretRead | undefined> {
    validatePath(path);
    const rec = this._paths.get(path);
    if (!rec) return undefined;
    const meta = rec.meta.get(version);
    if (!meta) {
      throw new SecretError(SecretErrorCode.VERSION_NOT_FOUND, `${path}@v${version} does not exist`);
    }
    const now = this._clock();
    const latest = Math.max(...rec.versions.keys());
    if (version !== latest && meta.expiresAt !== undefined && now > meta.expiresAt) {
      throw new SecretError(
        SecretErrorCode.VERSION_EXPIRED,
        `${path}@v${version} expired at ${meta.expiresAt} (now ${now}) — past rotation grace window`
      );
    }
    return this._read(path, rec, version);
  }

  async put(path: string, value: string, createdBy = 'anonymous', metadata?: Record<string, string>): Promise<number> {
    validatePath(path);
    let rec = this._paths.get(path);
    if (!rec) {
      rec = { versions: new Map(), meta: new Map(), nextVersion: 1 };
      this._paths.set(path, rec);
    }
    const now = this._clock();
    const version = rec.nextVersion++;

    // Stamp the superseded latest version with its grace expiry.
    if (rec.versions.size > 0) {
      const prevLatest = Math.max(...rec.versions.keys());
      const prevMeta = rec.meta.get(prevLatest);
      if (prevMeta) {
        rec.meta.set(prevLatest, { ...prevMeta, expiresAt: now + this._graceMs });
      }
    }

    const envId = `env-${this._envelopeSeq++}`;
    this._store.seal(envId, value);
    rec.versions.set(version, envId);
    rec.meta.set(version, {
      version,
      value: '', // plaintext never stored in metadata — lives only in Envelope
      createdAt: now,
      createdBy,
      ...(metadata ? { metadata } : {}),
    });

    this._prune(rec);
    return version;
  }

  async delete(path: string): Promise<boolean> {
    validatePath(path);
    const rec = this._paths.get(path);
    if (!rec) return false;
    for (const envId of rec.versions.values()) this._store.drop(envId);
    this._paths.delete(path);
    return true;
  }

  async list(pattern: string): Promise<ReadonlyArray<string>> {
    // Plain prefix (no wildcards) = subtree listing, matching Vault's
    // `list kv/` semantics: `kv/` lists everything under it.
    if (!pattern.includes('*')) {
      const prefix = pattern.endsWith('/') ? pattern : `${pattern}/`;
      const out: string[] = [];
      for (const p of this._paths.keys()) {
        if (p === pattern || p.startsWith(prefix)) out.push(p);
      }
      return out.sort();
    }
    const re = pathRegex(pattern);
    const out: string[] = [];
    for (const p of this._paths.keys()) {
      if (re.test(p.split('/').join('.'))) out.push(p);
    }
    return out.sort();
  }

  async versions(path: string): Promise<ReadonlyArray<number>> {
    validatePath(path);
    const rec = this._paths.get(path);
    if (!rec) return [];
    return Array.from(rec.versions.keys()).sort((a, b) => a - b);
  }

  /**
   * Sweep expired superseded versions — drops ciphertext envelopes past
   * their grace window. Called by the engine's maintenance loop; also runs
   * lazily inside `getVersion`'s expiry check.
   */
  sweepExpired(): number {
    const now = this._clock();
    let swept = 0;
    for (const rec of this._paths.values()) {
      const latest = rec.versions.size > 0 ? Math.max(...rec.versions.keys()) : 0;
      for (const [v, meta] of [...rec.meta.entries()]) {
        if (v !== latest && meta.expiresAt !== undefined && now > meta.expiresAt) {
          const envId = rec.versions.get(v);
          if (envId) this._store.drop(envId);
          rec.versions.delete(v);
          rec.meta.delete(v);
          swept++;
        }
      }
    }
    return swept;
  }

  private _read(path: string, rec: PathRecord, version: number): SecretRead {
    const envId = rec.versions.get(version);
    const meta = rec.meta.get(version);
    if (envId === undefined || meta === undefined) {
      throw new SecretError(SecretErrorCode.VERSION_NOT_FOUND, `${path}@v${version} does not exist`);
    }
    const value = this._store.open(envId);
    return {
      path,
      value,
      version,
      createdAt: meta.createdAt,
      ...(meta.expiresAt !== undefined ? { expiresAt: meta.expiresAt } : {}),
    };
  }

  /** Drop oldest non-latest versions beyond `maxVersionsPerPath`. */
  private _prune(rec: PathRecord): void {
    if (this._maxVersions <= 0) return;
    while (rec.versions.size > this._maxVersions) {
      const oldest = Math.min(...rec.versions.keys());
      const envId = rec.versions.get(oldest);
      if (envId) this._store.drop(envId);
      rec.versions.delete(oldest);
      rec.meta.delete(oldest);
    }
  }
}
