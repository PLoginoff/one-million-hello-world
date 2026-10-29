/**
 * Configuration Engine — Hot-Reload Watcher
 *
 * Polls registered sources at a fixed interval, comparing content
 * fingerprints so unchanged sources don't trigger a merge. When any source's
 * fingerprint moves, the watcher calls `engine.reload()` once for the whole
 * batch — so a deploy that touches env + remote simultaneously produces a
 * single diff + single listener notification, not a cascade.
 *
 * Design notes
 * ------------
 * - Fingerprinting is SHA-256 over a key-sorted stable serialization
 *   (order-independent, so map iteration order can't cause false diffs).
 * - Only sources implementing `fingerprint()` are polled; sources without a
 *   fingerprint are treated as volatile and always mark the batch dirty —
 *   conservative, since we can't prove they didn't change.
 * - Backoff: a source that throws while loading is retried with linear
 *   backoff (`pollInterval × consecutiveFailures`, capped at `maxBackoffMs`)
 *   and is *excluded* from the fingerprint comparison while failing, so a
 *   flapping remote can't poison the merged config with partial data.
 * - All timing is injectable (`sleeper`, clock) for deterministic tests.
 *
 * @module Configuration/Engine
 */

import { ConfigSource } from './ConfigTypes';
import { fingerprintEntries } from './ConfigSources';
import { ConfigEngine, ReloadResult } from './ConfigEngine';

/** Sources may optionally provide a fingerprint; engine sources do. */
interface Fingerprintable extends ConfigSource {
  fingerprint?(): string;
}

export interface WatcherOptions {
  /** Poll interval in ms (default 5000). */
  readonly pollIntervalMs?: number;
  /** Max backoff for a failing source (default 60000). */
  readonly maxBackoffMs?: number;
  /** Injectable sleep — default real setTimeout. */
  readonly sleeper?: (ms: number) => Promise<void>;
  /** Called after each reload triggered by the watcher. */
  readonly onReload?: (result: ReloadResult) => void;
  /** Called when a source load fails (with consecutive failure count). */
  readonly onSourceError?: (source: string, error: Error, consecutiveFailures: number) => void;
}

interface SourceState {
  source: Fingerprintable;
  lastFingerprint: string | undefined;
  consecutiveFailures: number;
  nextRetryAt: number;
}

export class ConfigWatcher {
  private readonly _engine: ConfigEngine;
  private readonly _pollMs: number;
  private readonly _maxBackoffMs: number;
  private readonly _sleeper: (ms: number) => Promise<void>;
  private readonly _onReload: ((result: ReloadResult) => void) | undefined;
  private readonly _onSourceError: ((source: string, error: Error, consecutiveFailures: number) => void) | undefined;

  private _states: Map<string, SourceState> = new Map();
  private _running = false;
  private _stopped: Promise<void> | null = null;
  private _stopResolve: (() => void) | null = null;
  private _reloadCount = 0;

  constructor(engine: ConfigEngine, options: WatcherOptions = {}) {
    this._engine = engine;
    this._pollMs = options.pollIntervalMs ?? 5000;
    this._maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this._sleeper = options.sleeper ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._onReload = options.onReload;
    this._onSourceError = options.onSourceError;
  }

  get reloadCount(): number {
    return this._reloadCount;
  }

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * Track a source for fingerprint polling. Called automatically for sources
   * registered *after* watch() starts via `watchSource`.
   */
  watchSource(source: Fingerprintable): void {
    if (this._states.has(source.name)) return;
    this._states.set(source.name, {
      source,
      lastFingerprint: undefined,
      consecutiveFailures: 0,
      nextRetryAt: 0,
    });
  }

  unwatchSource(name: string): void {
    this._states.delete(name);
  }

  /**
   * Single poll step — exported so tests can drive it deterministically.
   * Returns true when at least one source changed and `engine.reload()` ran.
   */
  async pollOnce(now: number): Promise<boolean> {
    let dirty = false;
    for (const state of this._states.values()) {
      // Backoff gate: skip failing sources until their retry window opens.
      if (state.consecutiveFailures > 0 && now < state.nextRetryAt) continue;
      const fp = await this._fingerprint(state);
      if (fp === undefined) {
        // Volatile source (no fingerprint) — always dirty.
        dirty = true;
        continue;
      }
      if (state.lastFingerprint !== undefined && state.lastFingerprint !== fp) dirty = true;
      state.lastFingerprint = fp;
    }
    if (!dirty) return false;
    const result = await this._engine.reload();
    this._reloadCount++;
    this._onReload?.(result);
    return true;
  }

  /**
   * Start the poll loop. Runs until `stop()`. Returns a promise that
   * resolves when the loop exits — call `stop()` to break it.
   */
  start(): Promise<void> {
    if (this._running) return this._stopped ?? Promise.resolve();
    this._running = true;
    this._stopped = new Promise((resolve) => {
      this._stopResolve = resolve;
    });
    void this._loop();
    return this._stopped;
  }

  /** Signal the loop to exit after the current poll. */
  stop(): void {
    this._running = false;
  }

  private async _loop(): Promise<void> {
    while (this._running) {
      await this._sleeper(this._pollMs);
      if (!this._running) break;
      try {
        await this.pollOnce(Date.now());
      } catch {
        // A poll error (e.g. engine strict-validation throw) must not kill
        // the loop — the next tick retries from the same fingerprints.
      }
    }
    this._stopResolve?.();
  }

  private async _fingerprint(state: SourceState): Promise<string | undefined> {
    try {
      let fp: string | undefined;
      if (state.source.fingerprint !== undefined) {
        fp = state.source.fingerprint();
      } else {
        const entries = await state.source.load();
        fp = fingerprintEntries(entries);
      }
      state.consecutiveFailures = 0;
      return fp;
    } catch (e) {
      state.consecutiveFailures += 1;
      state.nextRetryAt = Date.now() + Math.min(this._pollMs * state.consecutiveFailures, this._maxBackoffMs);
      this._onSourceError?.(state.source.name, e instanceof Error ? e : new Error(String(e)), state.consecutiveFailures);
      return state.lastFingerprint; // keep old fp — no change recorded
    }
  }
}
