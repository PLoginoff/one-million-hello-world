/**
 * Checkpointing
 *
 * In-memory checkpoint store plus a skippers log.
 *
 * The store keeps the last committed Checkpoint per (jobId, partition).
 * A real deployment would back this with a database; the interface is
 * async so swapping implementations is transparent to the engine.
 *
 * The SkippersLog is the "skippers file": every skipped record gets a
 * structured line (job, partition, index, error, payload preview) that
 * downstream tooling can replay or inspect.
 *
 * @module BatchProcessingLayer/Engine
 */

import { Checkpoint, CheckpointStore } from './types';

/** In-memory checkpoint store — suitable for tests and local runs. */
export class InMemoryCheckpointStore implements CheckpointStore {
  private _map: Map<string, Checkpoint>;

  constructor() {
    this._map = new Map();
  }

  private _key(jobId: string, partition: number): string {
    return `${jobId}#${partition}`;
  }

  async load(jobId: string, partition: number): Promise<Checkpoint | undefined> {
    return this._map.get(this._key(jobId, partition));
  }

  async save(jobId: string, partition: number, checkpoint: Checkpoint): Promise<void> {
    this._map.set(this._key(jobId, partition), checkpoint);
  }

  async clear(jobId: string): Promise<void> {
    for (const key of [...this._map.keys()]) {
      if (key.startsWith(jobId + '#')) this._map.delete(key);
    }
  }

  /** Snapshot for diagnostics. */
  all(): ReadonlyMap<string, Checkpoint> {
    return new Map(this._map);
  }
}

/** One entry in the skippers log. */
export interface SkipLogEntry {
  readonly jobId: string;
  readonly partition: number;
  /** Global item index. */
  readonly index: number;
  readonly errorMessage: string;
  readonly errorName: string;
  /** Truncated payload preview for the log line. */
  readonly payloadPreview: string;
  readonly timestamp: number;
}

/** Collects skipped-record entries (the "skippers file"). */
export class SkippersLog {
  private _entries: SkipLogEntry[];

  constructor() {
    this._entries = [];
  }

  record(entry: SkipLogEntry): void {
    this._entries.push(entry);
  }

  entries(): readonly SkipLogEntry[] {
    return this._entries.slice();
  }

  /** Filter by job. */
  forJob(jobId: string): SkipLogEntry[] {
    return this._entries.filter((e) => e.jobId === jobId);
  }

  /** Render as lines suitable for writing to a file. */
  toLines(): string[] {
    return this._entries.map(
      (e) =>
        `${new Date(e.timestamp).toISOString()} job=${e.jobId} ` +
        `partition=${e.partition} index=${e.index} ` +
        `error=${e.errorName}: ${e.errorMessage} payload=${e.payloadPreview}`
    );
  }

  clear(): void {
    this._entries = [];
  }

  get size(): number {
    return this._entries.length;
  }
}

/** Truncate a payload for the skip log. */
export function payloadPreview(data: unknown, maxLen = 120): string {
  let s: string;
  try {
    s = typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    s = String(data);
  }
  if (s.length > maxLen) return s.slice(0, maxLen - 3) + '...';
  return s;
}
