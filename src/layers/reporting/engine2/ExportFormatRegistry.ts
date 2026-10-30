/**
 * Reporting Engine2 — Versioned Export Formats
 *
 * ReportExporter produces one CSV/JSON shape forever. Real exports evolve:
 * finance's CSV gains a column, the JSON schema renames `rows` → `data`,
 * a partner pins format v2 while v3 rolls out. This registry treats export
 * formats as versioned artifacts:
 *
 *   - `register(format, version, serializer)` — immutable per (f,v);
 *     re-registering a (format,version) pair throws so a shipped format
 *     can never silently change under a consumer.
 *   - `export(result, format)` uses the format's LATEST version.
 *   - `export(result, format, version)` pins an older version — the
 *     compatibility guarantee partners rely on.
 *   - `changelog` records (format, version, summary) so "what changed in
 *     csv v3?" is answerable from the registry itself.
 *   - `diffSchema` compares two versions' declared column lists — the
 *     cheap compat check: added columns are safe, removed/renamed break.
 *
 * Complexity: register/lookup O(1) via nested maps; changelog O(log v)
 * per format (append-only, kept sorted).
 *
 * @module ReportingLayer/Engine2
 */

import { ReportResult } from '../reports/ReportTypes';

/** Produces the serialized artifact for one format version. */
export type ExportSerializer = (result: ReportResult) => string;

export interface FormatVersionInfo {
  readonly format: string;
  readonly version: number;
  /** Human summary of the change ("added currency column"). */
  readonly summary: string;
  readonly registeredAt: number;
  /** Declared output column names when known — powers diffSchema. */
  readonly columns?: readonly string[];
}

export interface FormatRegistration extends FormatVersionInfo {
  readonly serializer: ExportSerializer;
}

export interface SchemaDiff {
  readonly format: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** True when nothing was removed/renamed — additive only. */
  readonly backwardCompatible: boolean;
}

export class ExportFormatRegistry {
  /** format → version → registration (versions kept ascending). */
  private readonly _formats = new Map<string, Map<number, FormatRegistration>>();
  private readonly _changelog: FormatVersionInfo[] = [];
  private _now: () => number;

  constructor(now?: () => number) {
    this._now = now ?? (() => Date.now());
  }

  register(
    format: string,
    version: number,
    serializer: ExportSerializer,
    info?: { summary?: string; columns?: readonly string[] }
  ): void {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('version must be a positive integer');
    }
    let versions = this._formats.get(format);
    if (!versions) {
      versions = new Map();
      this._formats.set(format, versions);
    }
    if (versions.has(version)) {
      throw new Error(`${format} v${version} already registered — formats are immutable`);
    }
    const rec: FormatRegistration = {
      format,
      version,
      summary: info?.summary ?? '',
      registeredAt: this._now(),
      columns: info?.columns,
      serializer,
    };
    versions.set(version, rec);
    this._changelog.push(rec);
  }

  /** Versions of a format, ascending. Empty for unknown formats. */
  versions(format: string): readonly number[] {
    const v = this._formats.get(format);
    return v ? [...v.keys()].sort((a, b) => a - b) : [];
  }

  /** Latest registered version, or null. */
  latestVersion(format: string): number | null {
    const vs = this.versions(format);
    return vs.length === 0 ? null : vs[vs.length - 1];
  }

  /** Serialize with an explicit version, or the latest when omitted. */
  export(result: ReportResult, format: string, version?: number): string {
    const v = version ?? this.latestVersion(format);
    if (v === null) throw new Error(`unknown format '${format}'`);
    const rec = this._formats.get(format)?.get(v);
    if (!rec) throw new Error(`${format} v${v} not registered`);
    return rec.serializer(result);
  }

  /** Full changelog for a format (ascending), or all formats. */
  changelog(format?: string): readonly FormatVersionInfo[] {
    return format === undefined
      ? this._changelog
      : this._changelog.filter((c) => c.format === format);
  }

  /**
   * Compare declared columns between two versions. Throws when either
   * version is unknown or lacks declared columns.
   */
  diffSchema(format: string, fromVersion: number, toVersion: number): SchemaDiff {
    const get = (v: number): FormatRegistration => {
      const r = this._formats.get(format)?.get(v);
      if (!r) throw new Error(`${format} v${v} not registered`);
      if (!r.columns) throw new Error(`${format} v${v} declares no columns`);
      return r;
    };
    const from = get(fromVersion);
    const to = get(toVersion);
    const fromSet = new Set(from.columns);
    const toSet = new Set(to.columns);
    const added = to.columns!.filter((c) => !fromSet.has(c));
    const removed = from.columns!.filter((c) => !toSet.has(c));
    return {
      format,
      fromVersion,
      toVersion,
      added,
      removed,
      backwardCompatible: removed.length === 0,
    };
  }
}
