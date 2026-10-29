/**
 * Secrets Layer — Automated Rotation Scheduler
 *
 * Periodically rotates secrets by calling a per-path rotation function and
 * `put`ting the new value — giving each rotation a new version inside the
 * provider's grace window, so consumers holding the old version keep
 * working until it naturally expires.
 *
 * Design
 * ------
 * - Schedule: each registered path has `rotateEveryMs`; the rotator's
 *   `tick(now)` (driven by the watcher or a timer) rotates anything due.
 *   Injectable, deterministic — no real timers.
 * - Rotation function: `() => string` producing the next value. Errors are
 *   caught, counted, and the path is retried on next tick with linear
 *   backoff — a failing upstream (password API down) can't stall other
 *   rotations.
 * - Overlap guard: a rotation already in-flight for a path is not started
 *   again (idempotent `tick`).
 * - Rotation history retained per-path (bounded ring) for audit/replay.
 *
 * @module Secrets/Vault
 */

import { SecretContext, SecretProvider, SecretsClock } from './SecretTypes';

export interface RotationEntry {
  readonly path: string;
  readonly rotatedAt: number;
  readonly fromVersion: number | undefined;
  readonly toVersion: number;
  readonly by: string;
}

export interface RotationError {
  readonly path: string;
  readonly at: number;
  readonly error: string;
  readonly consecutiveFailures: number;
}

export interface RotationRegistration {
  readonly path: string;
  readonly rotateEveryMs: number;
  /** Produces the next secret value. */
  readonly generator: () => Promise<string> | string;
  readonly principal?: string;
}

interface RegistrationState {
  reg: RotationRegistration;
  lastRotatedAt: number;
  consecutiveFailures: number;
  nextRetryAt: number;
  inFlight: boolean;
}

const HISTORY_CAP = 50;

export class SecretRotator {
  private readonly _provider: SecretProvider;
  private readonly _clock: SecretsClock;
  private readonly _ctx: SecretContext;
  private readonly _states = new Map<string, RegistrationState>();
  private readonly _history = new Map<string, RotationEntry[]>();
  private readonly _errors: RotationError[] = [];
  private _onRotate: ((e: RotationEntry) => void) | undefined;
  private _onError: ((e: RotationError) => void) | undefined;

  constructor(provider: SecretProvider, options: { clock?: SecretsClock; principal?: string } = {}) {
    this._provider = provider;
    this._clock = options.clock ?? Date.now;
    this._ctx = { principal: options.principal ?? 'rotator' };
  }

  onRotate(cb: (e: RotationEntry) => void): void {
    this._onRotate = cb;
  }

  onError(cb: (e: RotationError) => void): void {
    this._onError = cb;
  }

  /** Register a path for scheduled rotation. */
  register(reg: RotationRegistration): void {
    const now = this._clock();
    this._states.set(reg.path, {
      reg,
      lastRotatedAt: now, // grace period from registration before first rotation
      consecutiveFailures: 0,
      nextRetryAt: 0,
      inFlight: false,
    });
  }

  unregister(path: string): boolean {
    return this._states.delete(path);
  }

  /** Paths currently due for rotation at `now` (or now). */
  due(now?: number): string[] {
    const t = now ?? this._clock();
    const out: string[] = [];
    for (const [path, s] of this._states) {
      const since = t - s.lastRotatedAt;
      const inBackoff = s.consecutiveFailures > 0 && t < s.nextRetryAt;
      if (since >= s.reg.rotateEveryMs && !inBackoff && !s.inFlight) out.push(path);
    }
    return out;
  }

  /**
   * Rotate every due path. Returns the completed rotations; errors are
   * recorded in `errors()` and retried with backoff.
   */
  async tick(now?: number): Promise<RotationEntry[]> {
    const t = now ?? this._clock();
    const duePaths = this.due(t);
    const out: RotationEntry[] = [];
    for (const path of duePaths) {
      const entry = await this._rotateOne(path);
      if (entry) out.push(entry);
    }
    return out;
  }

  /** Force-rotate a path now, ignoring its schedule. */
  async rotateNow(path: string): Promise<RotationEntry> {
    const s = this._states.get(path);
    if (!s) throw new Error(`no rotation registered for '${path}'`);
    const entry = await this._rotateOne(path, true);
    if (!entry) throw new Error(`rotation for '${path}' failed — see errors()`);
    return entry;
  }

  history(path: string): ReadonlyArray<RotationEntry> {
    return this._history.get(path) ?? [];
  }

  errors(): ReadonlyArray<RotationError> {
    return this._errors;
  }

  private async _rotateOne(path: string, force = false): Promise<RotationEntry | undefined> {
    const s = this._states.get(path);
    if (!s || s.inFlight) return undefined;
    s.inFlight = true;
    try {
      const versions = await this._provider.versions(path);
      const prev = versions.length > 0 ? versions[versions.length - 1] : undefined;
      const value = await s.reg.generator();
      const toVersion = await this._provider.put(path, value, s.reg.principal ?? this._ctx.principal);
      const now = this._clock();
      s.lastRotatedAt = now;
      s.consecutiveFailures = 0;
      const entry: RotationEntry = {
        path,
        rotatedAt: now,
        fromVersion: prev,
        toVersion,
        by: s.reg.principal ?? this._ctx.principal,
      };
      let h = this._history.get(path);
      if (!h) {
        h = [];
        this._history.set(path, h);
      }
      h.push(entry);
      if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP);
      this._onRotate?.(entry);
      return entry;
    } catch (e) {
      s.consecutiveFailures++;
      // Linear backoff: retry after rotateEveryMs × failures (bounded by the
      // schedule itself so a permanently-failing secret doesn't spin).
      s.nextRetryAt = this._clock() + Math.min(s.reg.rotateEveryMs * s.consecutiveFailures, s.reg.rotateEveryMs * 10);
      const err: RotationError = {
        path,
        at: this._clock(),
        error: e instanceof Error ? e.message : String(e),
        consecutiveFailures: s.consecutiveFailures,
      };
      this._errors.push(err);
      this._onError?.(err);
      return undefined;
    } finally {
      s.inFlight = false;
    }
  }
}
