/**
 * KillSwitch — instant, auditable disable for any feature/strategy key.
 *
 * A kill switch differs from a feature flag: it's the emergency brake,
 * not a rollout tool. Properties:
 *   - `isKilled(key)` is O(1) and safe in the hottest path;
 *   - killing records `reason`, `actor`, timestamp, and keeps an
 *     audit trail (who killed what, when, why, and when it was
 *     restored);
 *   - `killAll` is the red-button for incident response;
 *   - keys can have an optional `autoRestoreMs` — a panic kill that
 *     forgets to restore itself is still bounded.
 *
 * The switch is deliberately permissive about keys: killing an
 * unregistered key works (the registry is keyed by arbitrary string so
 * callers don't have to pre-declare what might need killing).
 *
 * Complexity: isKilled O(1); killAll O(#killed); audit is append-only.
 *
 * @module StrategyLayer/Engine
 */

import { StrategyEngineClock, SystemEngineClock } from './types';

export interface KillRecord {
  key: string;
  killedAt: number;
  reason: string;
  actor: string;
  /** Set when the kill auto-restores after `autoRestoreMs`. */
  expiresAt: number;
  restoredAt: number | null;
  restoredBy: string | null;
}

export interface KillAuditEntry {
  at: number;
  action: 'killed' | 'restored' | 'auto-restored' | 'kill-all';
  key: string;
  actor: string;
  reason: string;
}

export class KillSwitch {
  private readonly _clock: StrategyEngineClock;
  private readonly _killed = new Map<string, KillRecord>();
  private readonly _audit: KillAuditEntry[] = [];
  /** When set, every key is considered killed (the red button). */
  private _killAllAt: number | null = null;
  private _killAllReason = '';
  private _killAllActor = '';

  constructor(clock: StrategyEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /** Is `key` currently disabled? Checks kill-all and auto-restore. */
  isKilled(key: string): boolean {
    if (this._killAllAt !== null) return true;
    const rec = this._killed.get(key);
    if (!rec) return false;
    if (rec.expiresAt > 0 && this._clock.now() >= rec.expiresAt) {
      this._autoRestore(key, rec);
      return false;
    }
    return true;
  }

  /**
   * Kill `key`. Returns the record (idempotent — re-killing updates
   * reason/actor and resets the auto-restore window).
   */
  kill(key: string, reason = 'unspecified', actor = 'system', autoRestoreMs = 0): KillRecord {
    const now = this._clock.now();
    const rec: KillRecord = {
      key,
      killedAt: now,
      reason,
      actor,
      expiresAt: autoRestoreMs > 0 ? now + autoRestoreMs : 0,
      restoredAt: null,
      restoredBy: null,
    };
    this._killed.set(key, rec);
    this._audit.push({ at: now, action: 'killed', key, actor, reason });
    return rec;
  }

  /** Kill every key. The nuclear option — takes priority over restore. */
  killAll(reason = 'global kill', actor = 'system'): void {
    this._killAllAt = this._clock.now();
    this._killAllReason = reason;
    this._killAllActor = actor;
    this._audit.push({ at: this._clock.now(), action: 'kill-all', key: '*', actor, reason });
  }

  /** Lift the global kill (per-key kills persist). */
  clearKillAll(actor = 'system'): void {
    if (this._killAllAt === null) return;
    this._killAllAt = null;
    this._audit.push({
      at: this._clock.now(),
      action: 'restored',
      key: '*',
      actor,
      reason: `cleared kill-all by ${this._killAllActor}: ${this._killAllReason}`,
    });
    this._killAllReason = '';
    this._killAllActor = '';
  }

  /** Restore `key`; returns false if it wasn't killed. */
  restore(key: string, actor = 'system', reason = 'restored'): boolean {
    const rec = this._killed.get(key);
    if (!rec) return false;
    rec.restoredAt = this._clock.now();
    rec.restoredBy = actor;
    this._killed.delete(key);
    this._audit.push({ at: rec.restoredAt, action: 'restored', key, actor, reason });
    return true;
  }

  /** Every currently-killed key (kill-all reports as `['*']` merged in). */
  killedKeys(): string[] {
    this._expireOverdue();
    const out = Array.from(this._killed.keys());
    if (this._killAllAt !== null) out.unshift('*');
    return out;
  }

  /** Full audit trail, append-only. */
  audit(): ReadonlyArray<KillAuditEntry> {
    return this._audit.slice();
  }

  /** Records for currently-killed keys (for dashboards). */
  active(): KillRecord[] {
    this._expireOverdue();
    return Array.from(this._killed.values()).map((r) => ({ ...r }));
  }

  get killAllActive(): boolean {
    return this._killAllAt !== null;
  }

  /* ---------------------------------------------------------------- */

  private _expireOverdue(): void {
    const now = this._clock.now();
    for (const [k, rec] of this._killed) {
      if (rec.expiresAt > 0 && now >= rec.expiresAt) this._autoRestore(k, rec);
    }
  }

  private _autoRestore(key: string, rec: KillRecord): void {
    rec.restoredAt = this._clock.now();
    rec.restoredBy = 'auto-restore';
    this._killed.delete(key);
    this._audit.push({
      at: rec.restoredAt,
      action: 'auto-restored',
      key,
      actor: 'auto-restore',
      reason: `autoRestoreMs elapsed (was: ${rec.reason})`,
    });
  }
}
