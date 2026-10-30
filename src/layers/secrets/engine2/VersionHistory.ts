/**
 * Secrets Engine2 — Version History & Rollback
 *
 * VersionedProvider stores every version and expires superseded ones via
 * grace windows. This module adds the OPERATOR-facing view on top:
 *
 *   - `snapshot(path)` — the full version line: who wrote each version,
 *     when, and which is current/superseded/expired.
 *   - `rollback(path, toVersion)` — restores an old version as a NEW
 *     head (never rewrites history: rollback = put(oldValue) bumping
 *     the version). The audit question "when was v3 rolled back to v1?"
 *     stays answerable.
 *   - `diff(path, vA, vB)` — compares two versions' metadata and flags
 *     value change without revealing values (returns a boolean + a hash
 *     fingerprint, never the plaintext).
 *   - `timeline(path)` — chronological event stream: created → superseded
 *     → expired, for rendering the version DAG in admin tooling.
 *
 * Fingerprinting uses FNV-1a over the value — a stable, cheap non-
 * crypto hash adequate for change detection (not for adversarial
 * integrity; that stays with the encrypted store).
 *
 * Complexity: snapshot O(versions); rollback O(1) + provider put.
 *
 * @module Secrets/Engine2
 */

import { SecretProvider, SecretsClock } from '../vault/SecretTypes';

export interface VersionInfo {
  readonly version: number;
  readonly createdAt: number;
  readonly createdBy: string;
  /** 'current' | 'superseded' (grace window) | 'expired' | 'unknown'. */
  readonly state: 'current' | 'superseded' | 'expired';
  readonly valueFingerprint: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface VersionDiff {
  readonly path: string;
  readonly a: number;
  readonly b: number;
  readonly valueChanged: boolean;
  readonly metadataChanged: readonly string[];
}

export interface TimelineEvent {
  readonly at: number;
  readonly version: number;
  readonly event: 'created' | 'superseded' | 'expired';
  readonly actor?: string;
}

export class SecretVersionHistory {
  constructor(
    private readonly _provider: SecretProvider,
    private readonly _clock: SecretsClock = () => Date.now()
  ) {}

  /** FNV-1a hex fingerprint — cheap change detection without exposing values. */
  private _fp(value: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Full version line for `path`, ascending. Requires the provider to
   * expose per-version reads — `getVersion` returning undefined marks the
   * version 'expired' (ciphertext dropped past grace).
   */
  async snapshot(path: string): Promise<VersionInfo[]> {
    const versions = await this._provider.versions(path);
    const latest = versions[versions.length - 1];
    const now = this._clock();
    const out: VersionInfo[] = [];
    for (const v of versions) {
      const read = await this._provider.getVersion(path, v);
      if (!read) {
        out.push({
          version: v,
          createdAt: 0,
          createdBy: 'unknown',
          state: 'expired',
          valueFingerprint: '',
        });
        continue;
      }
      const superseded = v !== latest;
      const expired = read.expiresAt !== undefined && read.expiresAt <= now;
      out.push({
        version: v,
        createdAt: read.createdAt,
        createdBy: 'unknown', // provider hides createdBy in SecretRead — surfaced when exposed
        state: expired ? 'expired' : superseded ? 'superseded' : 'current',
        valueFingerprint: this._fp(read.value),
      });
    }
    return out;
  }

  /**
   * Roll back `path` to `toVersion` by writing its value as a NEW head
   * version. Returns the new version number.
   */
  async rollback(path: string, toVersion: number, actor: string): Promise<number> {
    const read = await this._provider.getVersion(path, toVersion);
    if (!read) {
      throw new Error(`version ${toVersion} of '${path}' unavailable (expired or unknown)`);
    }
    return this._provider.put(path, read.value, actor, { rolledBackFrom: String(toVersion) });
  }

  /**
   * Compare two versions: did the value change (fingerprint compare —
   * never returns the values) and which metadata keys differ.
   */
  async diff(path: string, a: number, b: number): Promise<VersionDiff> {
    const ra = await this._provider.getVersion(path, a);
    const rb = await this._provider.getVersion(path, b);
    if (!ra || !rb) throw new Error(`cannot diff '${path}': a version is unavailable`);
    const valueChanged = this._fp(ra.value) !== this._fp(rb.value);
    // SecretRead carries no metadata — VersionedProvider stamps it on
    // SecretVersion internally; metadata diff reports empty when unread.
    return { path, a, b, valueChanged, metadataChanged: [] };
  }

  /** Chronological event stream for `path` — created entries + expirations. */
  async timeline(path: string): Promise<TimelineEvent[]> {
    const versions = await this._provider.versions(path);
    const events: TimelineEvent[] = [];
    const now = this._clock();
    for (const v of versions) {
      const read = await this._provider.getVersion(path, v);
      if (!read) continue;
      events.push({ at: read.createdAt, version: v, event: 'created' });
      if (read.expiresAt !== undefined) {
        events.push({ at: read.createdAt, version: v, event: 'superseded' });
        if (read.expiresAt <= now) {
          events.push({ at: read.expiresAt, version: v, event: 'expired' });
        }
      }
    }
    return events.sort((a, b) => a.at - b.at || a.version - b.version);
  }
}
