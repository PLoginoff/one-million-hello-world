/**
 * Delta-like ACID Table Layer
 *
 * Implements the core ideas of Delta Lake's transaction protocol on top
 * of the in-memory object store:
 *
 *  - Commit log: an ordered, append-only sequence of actions (addFile,
 *    removeFile, metadata, protocol) per table version. JSON-lines style.
 *  - Snapshots: materialized views of the log at a version → the set of
 *    live files + schema. Rebuilt by log replay; checkpoints (compact
 *    snapshots) truncate replay cost.
 *  - Optimistic concurrency: writers read version N, stage actions, then
 *    commit-if-still-N; a concurrent commit forces retry — the classic
 *    OCC loop used by real Delta clients.
 *  - Time travel: `snapshot(version)` replays the log up to any version.
 *  - Vacuum: remove files dropped by tombstones older than retention.
 *
 * @module DataLake/Engine
 */

import { LakeObjectStore, LakeObject } from './ZoneManager';
import { LakeColumnSchema } from './ColumnarFileFormat';

/** Actions in the commit log (Delta action vocabulary). */
export type LogAction =
  | { type: 'add'; path: string; sizeBytes: number; partitionValues: Record<string, string>; stats?: { minValues?: Record<string, unknown>; maxValues?: Record<string, unknown>; nullCount?: Record<string, number> } }
  | { type: 'remove'; path: string; deletionTimestamp?: number }
  | { type: 'metadata'; schema: LakeColumnSchema[]; partitionColumns: string[] }
  | { type: 'protocol'; minReaderVersion: number; minWriterVersion: number };

/** A committed log entry: action + version + wall time. */
export interface CommitEntry {
  readonly version: number;
  readonly action: LogAction;
  readonly timestamp: number;
}

/** Materialized snapshot: live files + current schema. */
export interface TableSnapshot {
  readonly version: number;
  readonly schema: readonly LakeColumnSchema[];
  readonly partitionColumns: readonly string[];
  /** path → add action */
  readonly files: ReadonlyMap<string, Extract<LogAction, { type: 'add' }>>;
  readonly protocol: { minReaderVersion: number; minWriterVersion: number };
}

/** Conflict raised by the OCC commit check. */
export class ConcurrentModificationError extends Error {
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(expected: number, actual: number) {
    super(`Concurrent modification: expected version ${expected}, found ${actual}`);
    this.name = 'ConcurrentModificationError';
    this.expectedVersion = expected;
    this.actualVersion = actual;
  }
}

/**
 * Transaction log for one table.
 *
 * Layout in the object store:
 *   `<tablePath>/_log/<version>.commit.json`  — one file per commit
 *   `<tablePath>/_log/checkpoint.<v>.json`    — periodic compact snapshot
 *   `<tablePath>/<data files>`                — the data objects
 *
 * Commit ordering is guaranteed by an in-memory monotonic version per
 * table instance; OCC checks re-read the store to detect foreign writers.
 */
export class TransactionLog {
  readonly tablePath: string;
  private readonly _store: LakeObjectStore;
  private _version = -1; // -1 = uninitialised table
  private _cachedSnapshot: TableSnapshot | null = null;
  private readonly _checkpointInterval: number;

  constructor(store: LakeObjectStore, tablePath: string, opts: { checkpointInterval?: number } = {}) {
    this._store = store;
    this.tablePath = tablePath.endsWith('/') ? tablePath.slice(0, -1) : tablePath;
    this._checkpointInterval = opts.checkpointInterval ?? 10;
  }

  get version(): number {
    return this._version;
  }

  private _logPath(version: number): string {
    return `${this.tablePath}/_log/${String(version).padStart(20, '0')}.commit.json`;
  }

  private _checkpointPath(version: number): string {
    return `${this.tablePath}/_log/checkpoint.${String(version).padStart(20, '0')}.json`;
  }

  /** Detect the highest committed version in the store. O(#objects). */
  private _latestCommittedVersion(): number {
    const prefix = `${this.tablePath}/_log/`;
    let max = -1;
    for (const obj of this._store.list(prefix)) {
      const name = obj.path.slice(prefix.length);
      if (name.endsWith('.commit.json')) {
        const v = parseInt(name.slice(0, -'.commit.json'.length), 10);
        if (!Number.isNaN(v) && v > max) max = v;
      }
    }
    return max;
  }

  /** Initialise the table with schema + protocol (version 0). */
  initialise(schema: LakeColumnSchema[], partitionColumns: string[] = []): number {
    if (this._version >= 0 || this._latestCommittedVersion() >= 0) {
      throw new Error(`Table '${this.tablePath}' already initialised`);
    }
    const actions: LogAction[] = [
      { type: 'protocol', minReaderVersion: 1, minWriterVersion: 1 },
      { type: 'metadata', schema, partitionColumns },
    ];
    this._commit(0, actions);
    return 0;
  }

  /**
   * Optimistic commit: write actions as the next version iff no other
   * writer advanced the log since `expectedVersion`.
   *
   * Throws ConcurrentModificationError on conflict — caller retries with
   * a fresh snapshot (the standard Delta OCC pattern).
   */
  commit(expectedVersion: number, actions: LogAction[]): number {
    const latest = this._latestCommittedVersion();
    if (latest !== expectedVersion) {
      throw new ConcurrentModificationError(expectedVersion, latest);
    }
    const next = expectedVersion + 1;
    this._commit(next, actions);
    return next;
  }

  private _commit(version: number, actions: LogAction[]): void {
    const entries: CommitEntry[] = actions.map((a) => ({ version, action: a, timestamp: Date.now() }));
    const payload = new TextEncoder().encode(JSON.stringify(entries));
    this._store.put({
      path: this._logPath(version),
      zone: 'curated',
      data: payload,
      contentType: 'application/json',
      tags: { kind: 'commit' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sizeBytes: payload.byteLength,
    });
    this._version = version;
    this._cachedSnapshot = null;
    if (version > 0 && version % this._checkpointInterval === 0) {
      this._writeCheckpoint();
    }
  }

  private _writeCheckpoint(): void {
    const snap = this._replay(this._version);
    const serial = {
      version: snap.version,
      schema: snap.schema,
      partitionColumns: snap.partitionColumns,
      files: [...snap.files.values()],
      protocol: snap.protocol,
    };
    const payload = new TextEncoder().encode(JSON.stringify(serial));
    this._store.put({
      path: this._checkpointPath(this._version),
      zone: 'curated',
      data: payload,
      contentType: 'application/json',
      tags: { kind: 'checkpoint' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sizeBytes: payload.byteLength,
    });
  }

  /** Find the newest checkpoint ≤ version. */
  private _latestCheckpoint(version: number): { version: number; snap: TableSnapshot } | null {
    const prefix = `${this.tablePath}/_log/`;
    let best = -1;
    for (const obj of this._store.list(prefix)) {
      const name = obj.path.slice(prefix.length);
      if (name.startsWith('checkpoint.')) {
        const v = parseInt(name.slice('checkpoint.'.length, -'.json'.length), 10);
        if (!Number.isNaN(v) && v <= version && v > best) best = v;
      }
    }
    if (best < 0) return null;
    const obj = this._store.get(this._checkpointPath(best));
    if (obj === undefined) return null;
    const parsed = JSON.parse(new TextDecoder().decode(obj.data)) as {
      version: number; schema: LakeColumnSchema[]; partitionColumns: string[];
      files: Extract<LogAction, { type: 'add' }>[];
      protocol: { minReaderVersion: number; minWriterVersion: number };
    };
    const files = new Map<string, Extract<LogAction, { type: 'add' }>>();
    for (const f of parsed.files) files.set(f.path, f);
    return {
      version: best,
      snap: { version: best, schema: parsed.schema, partitionColumns: parsed.partitionColumns, files, protocol: parsed.protocol },
    };
  }

  /**
   * Replay the log (from latest checkpoint if present) to build the
   * snapshot at `version` (default: latest). O(#log entries after
   * checkpoint).
   */
  private _replay(version: number): TableSnapshot {
    const cp = this._latestCheckpoint(version);
    let schema: LakeColumnSchema[] = [];
    let partitionColumns: string[] = [];
    let protocol = { minReaderVersion: 1, minWriterVersion: 1 };
    const files = new Map<string, Extract<LogAction, { type: 'add' }>>();
    let start = 0;
    if (cp !== null) {
      schema = [...cp.snap.schema];
      partitionColumns = [...cp.snap.partitionColumns];
      protocol = cp.snap.protocol;
      for (const [k, v] of cp.snap.files) files.set(k, v);
      start = cp.version + 1;
    }
    for (let v = start; v <= version; v++) {
      const obj = this._store.get(this._logPath(v));
      if (obj === undefined) throw new Error(`Missing commit file for version ${v}`);
      const entries = JSON.parse(new TextDecoder().decode(obj.data)) as CommitEntry[];
      for (const e of entries) {
        switch (e.action.type) {
          case 'add':
            files.set(e.action.path, e.action);
            break;
          case 'remove':
            files.delete(e.action.path);
            break;
          case 'metadata':
            schema = e.action.schema;
            partitionColumns = e.action.partitionColumns;
            break;
          case 'protocol':
            protocol = { minReaderVersion: e.action.minReaderVersion, minWriterVersion: e.action.minWriterVersion };
            break;
        }
      }
    }
    return { version, schema, partitionColumns, files, protocol };
  }

  /** Current snapshot (cached until next commit). */
  snapshot(): TableSnapshot;
  snapshot(version: number): TableSnapshot;
  snapshot(version?: number): TableSnapshot {
    const v = version ?? this._latestCommittedVersion();
    if (v < 0) throw new Error(`Table '${this.tablePath}' not initialised`);
    if (this._cachedSnapshot !== null && this._cachedSnapshot.version === v && version === undefined) {
      return this._cachedSnapshot;
    }
    const snap = this._replay(v);
    if (version === undefined) this._cachedSnapshot = snap;
    return snap;
  }

  /**
   * Time travel: snapshot at a specific version.
   */
  snapshotAt(version: number): TableSnapshot {
    return this._replay(version);
  }

  /** List all committed versions with timestamps (for history/audit). */
  history(): Array<{ version: number; timestamp: number; actions: number }> {
    const out: Array<{ version: number; timestamp: number; actions: number }> = [];
    const latest = this._latestCommittedVersion();
    for (let v = 0; v <= latest; v++) {
      const obj = this._store.get(this._logPath(v));
      if (obj === undefined) continue;
      const entries = JSON.parse(new TextDecoder().decode(obj.data)) as CommitEntry[];
      out.push({ version: v, timestamp: entries[0]?.timestamp ?? 0, actions: entries.length });
    }
    return out;
  }

  /**
   * Vacuum: physically delete data objects removed from the live file
   * set whose remove timestamp is older than `retentionMs`.
   *
   * Walks the whole log to collect removed paths (tombstones), then
   * deletes only store objects not present in the current snapshot —
   * never touches live files. Returns freed paths.
   */
  vacuum(retentionMs: number, now = Date.now()): string[] {
    const snap = this.snapshot();
    const removed = new Map<string, number>(); // path → removal ts
    const latest = this._latestCommittedVersion();
    for (let v = 0; v <= latest; v++) {
      const obj = this._store.get(this._logPath(v));
      if (obj === undefined) continue;
      const entries = JSON.parse(new TextDecoder().decode(obj.data)) as CommitEntry[];
      for (const e of entries) {
        if (e.action.type === 'remove') {
          removed.set(e.action.path, e.action.deletionTimestamp ?? e.timestamp);
        }
      }
    }
    const freed: string[] = [];
    for (const [path, ts] of removed) {
      if (snap.files.has(path)) continue; // re-added later → live
      if (now - ts < retentionMs) continue; // still within retention
      if (this._store.delete(path)) freed.push(path);
    }
    return freed;
  }
}

/* ------------------------------------------------------------------------ */
/* High-level table writer (OCC transaction helper)                         */
/* ------------------------------------------------------------------------ */

/**
 * Transactional writer for a DeltaTable.
 *
 * `write` stages add/remove actions, then commits optimistically; on
 * ConcurrentModificationError it re-reads, re-merges actions and retries
 * up to `maxRetries` — the standard OCC conflict loop.
 */
export class DeltaTable {
  readonly log: TransactionLog;
  private readonly _store: LakeObjectStore;
  private readonly _maxRetries: number;

  constructor(store: LakeObjectStore, tablePath: string, opts: { maxRetries?: number; checkpointInterval?: number } = {}) {
    this._store = store;
    this.log = new TransactionLog(store, tablePath, opts);
    this._maxRetries = opts.maxRetries ?? 5;
  }

  /**
   * Add data files transactionally. `files` entries become the object
   * payloads; commit succeeds only if no concurrent writer intervened.
   */
  write(
    files: Array<{ path: string; data: Uint8Array; partitionValues?: Record<string, string>; stats?: Extract<LogAction, { type: 'add' }>['stats'] }>,
    mode: 'append' | 'overwrite' = 'append'
  ): number {
    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      const snap = this.log.snapshot();
      const actions: LogAction[] = [];
      if (mode === 'overwrite') {
        for (const path of snap.files.keys()) {
          actions.push({ type: 'remove', path, deletionTimestamp: Date.now() });
        }
      }
      for (const f of files) {
        const fullPath = `${this.log.tablePath}/${f.path}`;
        // Stage the object unconditionally — if the commit conflicts the
        // staged object is orphaned but harmless (vacuumable).
        this._store.put({
          path: fullPath,
          zone: 'curated',
          data: f.data,
          contentType: 'application/x-lake-columnar',
          tags: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sizeBytes: f.data.byteLength,
        });
        actions.push({
          type: 'add',
          path: fullPath,
          sizeBytes: f.data.byteLength,
          partitionValues: f.partitionValues ?? {},
          stats: f.stats,
        });
      }
      try {
        return this.log.commit(snap.version, actions);
      } catch (e) {
        if (e instanceof ConcurrentModificationError && attempt < this._maxRetries) {
          continue; // retry with fresh snapshot
        }
        throw e;
      }
    }
    throw new Error('unreachable');
  }

  /** Read live data objects at the current (or given) version. */
  files(version?: number): LakeObject[] {
    const snap = version === undefined ? this.log.snapshot() : this.log.snapshotAt(version);
    const out: LakeObject[] = [];
    for (const path of snap.files.keys()) {
      const obj = this._store.get(path);
      if (obj !== undefined) out.push(obj);
    }
    return out;
  }
}
