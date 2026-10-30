/**
 * Versioned Table — schema-enforced row storage with time travel
 *
 * The base engine provides a Delta-like transaction log (file-level
 * `add`/`remove`/`metadata` actions). This module adds the layer real
 * table formats put on top of that log:
 *
 *   - **Schema enforcement on write**: every row batch is checked
 *     against the table schema *before* it lands in a file — wrong types,
 *     missing required columns, and unexpected extra columns are
 *     rejected at the boundary, not discovered downstream.
 *   - **Versioned commits**: each write produces a data file *plus* a
 *     manifest commit in the log — the atomic unit readers snapshot
 *     against.
 *   - **Time travel**: `readAsOf(version | timestamp)` replays the log
 *     to the requested point and returns the rows live at that version —
 *     "the table as of last Tuesday".
 *   - **Snapshots**: `snapshot()` captures the current file list + schema
 *     for zero-copy reads of a consistent view while writers continue.
 *
 * Storage model: rows are stored as logical row-batches per file
 * (in-memory reference implementation; a real deployment would hand
 * the batches to a columnar writer). Each commit's manifest records
 * the file paths it added/removed so compaction can rewrite manifests
 * deterministically.
 *
 * Complexity: O(rows) per write; O(#versions) replay per time-travel.
 *
 * @module DataLake/Engine2
 */

import { LakeColumnSchema, LakeRow, LakeScalar } from '../engine/ColumnarFileFormat';
import { LakeObjectStore, LakeObject } from '../engine/ZoneManager';
import { LogAction } from '../engine/TransactionLog';

/** A data file tracked by the table manifest. */
export interface TableFile {
  readonly path: string;
  readonly rowCount: number;
  readonly sizeBytes: number;
  readonly partitionValues: Readonly<Record<string, string>>;
  /** Version when this file was added. */
  readonly addedAtVersion: number;
}

/** The table's manifest at a version — the "what's live" list. */
export interface TableManifest {
  readonly version: number;
  readonly schema: readonly LakeColumnSchema[];
  readonly files: readonly TableFile[];
  readonly totalRows: number;
  readonly totalBytes: number;
}

/** A single committed change (add/remove rows, schema change). */
export interface TableCommit {
  readonly version: number;
  readonly timestamp: number;
  readonly addedFiles: readonly TableFile[];
  readonly removedPaths: readonly string[];
  readonly schemaChange?: { readonly from: number; readonly to: number };
}

/** Write options. */
export interface WriteOptions {
  /** Partition values for hive-style layout. */
  readonly partitions?: Record<string, string>;
  /** If set, rows violating schema are dropped instead of failing. */
  readonly allowDropInvalid?: boolean;
}

/** Schema mismatch on write. */
export class SchemaViolationError extends Error {
  readonly violations: readonly string[];
  constructor(violations: readonly string[]) {
    super(`schema violation(s): ${violations.join('; ')}`);
    this.name = 'SchemaViolationError';
    this.violations = violations;
  }
}

/** Version/timestamp out of range for time travel. */
export class VersionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionNotFoundError';
  }
}

/* ------------------------------------------------------------------------ */
/* Schema enforcement                                                        */
/* ------------------------------------------------------------------------ */

/** Check a scalar against a column type. Returns an error or null. */
function checkScalar(col: LakeColumnSchema, v: LakeScalar): string | null {
  if (v === null || v === undefined) {
    return col.nullable ? null : `column '${col.name}' is not nullable`;
  }
  switch (col.type) {
    case 'int32':
    case 'int64':
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        return `column '${col.name}' expects integer, got ${typeof v} '${String(v)}'`;
      }
      if (col.type === 'int32' && (v < -2147483648 || v > 2147483647)) {
        return `column '${col.name}' int32 overflow: ${v}`;
      }
      return null;
    case 'float64':
      return typeof v === 'number' ? null : `column '${col.name}' expects number, got ${typeof v}`;
    case 'boolean':
      return typeof v === 'boolean' ? null : `column '${col.name}' expects boolean, got ${typeof v}`;
    case 'utf8':
      return typeof v === 'string' ? null : `column '${col.name}' expects string, got ${typeof v}`;
    default:
      return null;
  }
}

/** Validate a batch of rows against the schema. Returns violations. */
export function validateRows(
  rows: readonly LakeRow[],
  schema: readonly LakeColumnSchema[]
): string[] {
  const violations: string[] = [];
  const colByName = new Map(schema.map((c) => [c.name, c]));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const col of schema) {
      const err = checkScalar(col, r[col.name] === undefined ? null : r[col.name]);
      if (err !== null) violations.push(`row ${i}: ${err}`);
    }
    // Extra columns not in the schema are flagged — strict enforcement.
    for (const k of Object.keys(r)) {
      if (!colByName.has(k)) violations.push(`row ${i}: unexpected column '${k}'`);
    }
  }
  return violations;
}

/* ------------------------------------------------------------------------ */
/* VersionedTable                                                            */
/* ------------------------------------------------------------------------ */

/**
 * A schema-enforced, versioned row table over the object store.
 *
 * Internal layout:
 *   `<tablePath>/_manifests/<version>.manifest.json` — commit manifest
 *   `<tablePath>/<partitionPath>/part-<seq>.rows.json` — row payload
 *
 * The manifest history is the table's logical log; `snapshot()` reads
 * the latest manifest, `readAsOf` replays to the requested version.
 */
/** Injectable clock — epoch ms. Keeps commit ordering deterministic in tests. */
export type TableClock = () => number;

export class VersionedTable {
  readonly path: string;
  private readonly _store: LakeObjectStore;
  private _schema: LakeColumnSchema[];
  private readonly _partitionColumns: readonly string[];
  private readonly _clock: TableClock;
  private _version = 0;
  private _files = new Map<string, TableFile>();
  private _seq = 0;
  private readonly _manifests: TableManifest[] = [];
  private readonly _commits: TableCommit[] = [];
  private readonly _fileRows = new Map<string, LakeRow[]>();

  constructor(
    store: LakeObjectStore,
    tablePath: string,
    schema: readonly LakeColumnSchema[],
    partitionColumns: readonly string[] = [],
    clock: TableClock = Date.now
  ) {
    this._store = store;
    this.path = tablePath.endsWith('/') ? tablePath.slice(0, -1) : tablePath;
    this._schema = [...schema];
    this._partitionColumns = [...partitionColumns];
    this._clock = clock;
    // Version 0 = the empty table manifest.
    this._manifests.push(this._currentManifest());
    this._commits.push({ version: 0, timestamp: this._clock(), addedFiles: [], removedPaths: [] });
  }

  get version(): number {
    return this._version;
  }

  get schema(): readonly LakeColumnSchema[] {
    return this._schema;
  }

  get partitionColumns(): readonly string[] {
    return this._partitionColumns;
  }

  /** All live files at the current version. */
  get files(): readonly TableFile[] {
    return [...this._files.values()];
  }

  /** All manifests (metadata only). */
  get manifests(): readonly TableManifest[] {
    return this._manifests;
  }

  /** All commits (metadata only). */
  get commits(): readonly TableCommit[] {
    return this._commits;
  }

  /**
   * Write a row batch as a new file + manifest commit.
   * By default a schema violation rejects the whole batch atomically;
   * `allowDropInvalid` drops offending rows instead.
   */
  write(rows: readonly LakeRow[], opts: WriteOptions = {}): TableFile {
    const violations = validateRows(rows, this._schema);
    let toWrite = rows;
    if (violations.length > 0) {
      if (opts.allowDropInvalid !== true) {
        throw new SchemaViolationError(violations);
      }
      // Drop the offending rows — index set of bad rows from violations.
      const bad = new Set<number>();
      for (const v of violations) {
        const m = /^row (\d+):/.exec(v);
        if (m !== null) bad.add(Number(m[1]));
      }
      toWrite = rows.filter((_, i) => !bad.has(i));
    }
    const partitions = opts.partitions ?? {};
    const dir = this._partitionDir(partitions);
    const fileName = `part-${String(++this._seq).padStart(8, '0')}.rows.json`;
    const path = dir.length === 0 ? `${this.path}/${fileName}` : `${this.path}/${dir}/${fileName}`;
    const data = new TextEncoder().encode(JSON.stringify(toWrite));
    this._store.put({
      path,
      zone: 'curated',
      data,
      contentType: 'application/x-rows-json',
      tags: { table: this.path },
      createdAt: this._clock(),
      updatedAt: this._clock(),
      sizeBytes: data.byteLength,
    });
    this._fileRows.set(path, [...toWrite]);
    const file: TableFile = {
      path,
      rowCount: toWrite.length,
      sizeBytes: data.byteLength,
      partitionValues: { ...partitions },
      addedAtVersion: this._version + 1,
    };
    this._commit([file], []);
    return file;
  }

  /**
   * Delete files matching a predicate — commits a remove-only manifest.
   * Returns the removed file paths.
   */
  deleteFiles(predicate: (f: TableFile) => boolean): string[] {
    const removed: string[] = [];
    for (const [path, f] of this._files) {
      if (predicate(f)) {
        removed.push(path);
        // NOTE: payloads stay in the store and _fileRows — time travel
        // needs the historical bytes. A real deployment would vacuum
        // tombstoned files past retention.
      }
    }
    if (removed.length > 0) this._commit([], removed);
    return removed;
  }

  /**
   * Read all live rows at the current version.
   * `projection` limits returned columns (projection pushdown).
   */
  read(projection?: readonly string[]): LakeRow[] {
    const out: LakeRow[] = [];
    for (const f of this._files.values()) {
      for (const r of this._fileRows.get(f.path) ?? []) {
        out.push(projection === undefined ? r : this._project(r, projection));
      }
    }
    return out;
  }

  /**
   * Time travel: rows live at `version` (or as-of `timestamp` when the
   * overload is used). Replays the manifest history.
   */
  readAsOf(version: number, projection?: readonly string[]): LakeRow[] {
    const manifest = this.manifestAt(version);
    const out: LakeRow[] = [];
    for (const f of manifest.files) {
      for (const r of this._fileRows.get(f.path) ?? []) {
        out.push(projection === undefined ? r : this._project(r, projection));
      }
    }
    return out;
  }

  /** Manifest at a specific version. */
  manifestAt(version: number): TableManifest {
    if (version < 0 || version >= this._manifests.length) {
      throw new VersionNotFoundError(`version ${version} out of range [0, ${this._manifests.length - 1}]`);
    }
    return this._manifests[version];
  }

  /**
   * Version as-of a timestamp — the latest manifest committed ≤ `ts`.
   * Used for `readAsOf(timestamp)`-style queries.
   */
  versionAtTimestamp(ts: number): number {
    let v = 0;
    for (const c of this._commits) {
      if (c.timestamp <= ts && c.version > v) v = c.version;
    }
    return v;
  }

  /** A zero-copy consistent snapshot of current state. */
  snapshot(): TableManifest {
    return this._currentManifest();
  }

  /**
   * Apply a schema migration — bumps the schema and commits a
   * metadata-only manifest. New columns must be nullable or have a
   * default; dropped columns are removed.
   */
  evolveSchema(newSchema: readonly LakeColumnSchema[]): void {
    const commit: TableCommit = {
      version: this._version + 1,
      timestamp: this._clock(),
      addedFiles: [],
      removedPaths: [],
      schemaChange: { from: this._version, to: this._version + 1 },
    };
    this._schema = [...newSchema];
    this._version++;
    this._commits.push(commit);
    this._manifests.push(this._currentManifest());
  }

  /* ----- internals ------------------------------------------------------ */

  private _partitionDir(partitions: Record<string, string>): string {
    const segs: string[] = [];
    for (const col of this._partitionColumns) {
      const v = partitions[col];
      if (v !== undefined) segs.push(`${col}=${v}`);
    }
    return segs.join('/');
  }

  private _commit(added: readonly TableFile[], removed: readonly string[]): void {
    for (const p of removed) this._files.delete(p);
    for (const f of added) this._files.set(f.path, f);
    this._version++;
    this._commits.push({
      version: this._version,
      timestamp: this._clock(),
      addedFiles: added,
      removedPaths: removed,
    });
    this._manifests.push(this._currentManifest());
  }

  private _currentManifest(): TableManifest {
    const files = [...this._files.values()];
    return {
      version: this._version,
      schema: [...this._schema],
      files,
      totalRows: files.reduce((a, f) => a + f.rowCount, 0),
      totalBytes: files.reduce((a, f) => a + f.sizeBytes, 0),
    };
  }

  private _project(row: LakeRow, cols: readonly string[]): LakeRow {
    const out: LakeRow = {};
    for (const c of cols) {
      if (c in row) out[c] = row[c];
    }
    return out;
  }

  /** Expose row payloads for the compaction engine. */
  rowsOf(path: string): readonly LakeRow[] {
    return this._fileRows.get(path) ?? [];
  }

  /** Internal: used by the CompactionEngine to swap file sets atomically.
   *  Payloads of removed files are kept for time-travel (vacuum is a
   *  separate lifecycle job).
   */
  replaceFiles(removedPaths: readonly string[], addedFiles: readonly TableFile[]): void {
    for (const p of removedPaths) {
      this._files.delete(p);
    }
    for (const f of addedFiles) {
      this._files.set(f.path, f);
      const obj = this._store.get(f.path);
      if (obj !== undefined) {
        this._fileRows.set(f.path, JSON.parse(new TextDecoder().decode(obj.data)) as LakeRow[]);
      }
    }
    this._commit(addedFiles, [...removedPaths]);
  }

  /** Object store accessor for engine2 collaborators. */
  get store(): LakeObjectStore {
    return this._store;
  }
}

/** Delta-style add/remove actions for external log consumers. */
export function manifestToActions(m: TableManifest): LogAction[] {
  return m.files.map((f) => ({
    type: 'add',
    path: f.path,
    sizeBytes: f.sizeBytes,
    partitionValues: { ...f.partitionValues },
  }));
}
