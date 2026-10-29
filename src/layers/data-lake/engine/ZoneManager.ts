/**
 * Data Lake Zone Management
 *
 * A data lake organises objects into zones of increasing trust:
 *
 *   raw     → immutable landing area; source-format payloads, no guarantees
 *   staged  → validated, typed, partitioned; may still be rejected
 *   curated → deduplicated, conformed, quality-checked; consumption-ready
 *
 * This module implements an in-memory object store keyed by POSIX-like
 * paths plus a `ZoneManager` that enforces promotion rules:
 *
 *   - Objects can only move raw → staged → curated (no skipping, unless
 *     `allowSkip` is set on the zone policy).
 *   - Promotion runs the zone's validators; failures leave the object in
 *     place and record a quarantine entry.
 *   - Every transition is journaled for auditability.
 *
 * @module DataLake/Engine
 */

/** Zone identifiers in promotion order. */
export type Zone = 'raw' | 'staged' | 'curated';

const ZONE_ORDER: readonly Zone[] = ['raw', 'staged', 'curated'];

/** A stored object (opaque bytes + metadata). */
export interface LakeObject {
  /** Full virtual path, e.g. `staged/events/dt=2024-01-01/part-0001.bin`. */
  readonly path: string;
  readonly zone: Zone;
  /** Raw payload bytes. */
  readonly data: Uint8Array;
  /** Content type tag (e.g. 'application/x-ndjson'). */
  readonly contentType: string;
  /** Free-form tags carried through promotions. */
  readonly tags: Record<string, string>;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Schema version tag for evolution tracking. */
  readonly schemaVersion?: number;
  readonly sizeBytes: number;
}

/** Validation result for a promotion attempt. */
export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: string[];
}

/** A validator applied when objects enter a zone. */
export type ZoneValidator = (obj: LakeObject) => ValidationResult;

/** Policy attached to each zone. */
export interface ZonePolicy {
  /** Validators executed on entry into this zone. */
  readonly validators: ZoneValidator[];
  /** Allow skipping intermediate zones (raw → curated). Default false. */
  readonly allowSkip?: boolean;
  /** Retention hint in ms — advisory, enforced by the caller's lifecycle job. */
  readonly retentionMs?: number;
  /** Maximum single object size admitted into the zone. */
  readonly maxObjectBytes?: number;
}

/** Journal entry recording a zone transition. */
export interface ZoneTransition {
  readonly path: string;
  readonly from: Zone;
  readonly to: Zone;
  readonly at: number;
  readonly ok: boolean;
  readonly errors: string[];
}

/** Quarantined object with failure context. */
export interface QuarantineEntry {
  readonly object: LakeObject;
  readonly targetZone: Zone;
  readonly errors: string[];
  readonly at: number;
}

/* ------------------------------------------------------------------------ */
/* In-memory object store                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Flat in-memory object store.
 *
 * Keys are full virtual paths (`zone/...`); no directory objects — path
 * prefixes are resolved via string scanning which is O(#objects). Fine
 * for a reference implementation.
 */
export class LakeObjectStore {
  private readonly _objects = new Map<string, LakeObject>();

  put(obj: LakeObject): void {
    this._objects.set(obj.path, obj);
  }

  get(path: string): LakeObject | undefined {
    return this._objects.get(path);
  }

  delete(path: string): boolean {
    return this._objects.delete(path);
  }

  has(path: string): boolean {
    return this._objects.has(path);
  }

  /** List objects under a prefix; O(#objects). */
  list(prefix = ''): LakeObject[] {
    const out: LakeObject[] = [];
    for (const [k, v] of this._objects) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  /** Objects in a single zone. */
  listZone(zone: Zone): LakeObject[] {
    return this.list(`${zone}/`);
  }

  get size(): number {
    return this._objects.size;
  }
}

/* ------------------------------------------------------------------------ */
/* Zone manager                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Enforces zone policies and records transitions.
 *
 * Invariants:
 *  - Object path must start with `<zone>/`.
 *  - Promotion target must be exactly one zone ahead (or more with
 *    `allowSkip` on every intermediate policy).
 *  - Failed validations quarantine the object — the copy stays at source.
 */
export class ZoneManager {
  private readonly _store: LakeObjectStore;
  private readonly _policies = new Map<Zone, ZonePolicy>();
  private readonly _journal: ZoneTransition[] = [];
  private readonly _quarantine: QuarantineEntry[] = [];

  constructor(store: LakeObjectStore) {
    this._store = store;
    this._policies.set('raw', { validators: [] });
    this._policies.set('staged', { validators: [] });
    this._policies.set('curated', { validators: [] });
  }

  setPolicy(zone: Zone, policy: ZonePolicy): void {
    this._policies.set(zone, policy);
  }

  policy(zone: Zone): ZonePolicy {
    const p = this._policies.get(zone);
    if (p === undefined) throw new Error(`No policy for zone '${zone}'`);
    return p;
  }

  get journal(): readonly ZoneTransition[] {
    return this._journal;
  }

  get quarantine(): readonly QuarantineEntry[] {
    return this._quarantine;
  }

  /**
   * Ingest a new object into a zone (usually `raw`).
   * Runs the zone's validators immediately — bad objects land in quarantine.
   */
  ingest(path: string, data: Uint8Array, contentType = 'application/octet-stream', tags: Record<string, string> = {}): ValidationResult {
    const zone = zoneOfPath(path);
    if (zone === null) return { ok: false, errors: [`Path '${path}' is not inside a zone`] };
    const obj: LakeObject = {
      path,
      zone,
      data,
      contentType,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sizeBytes: data.byteLength,
    };
    const result = this._validate(obj, this.policy(zone));
    if (!result.ok) {
      this._quarantine.push({ object: obj, targetZone: zone, errors: result.errors, at: Date.now() });
      return result;
    }
    this._store.put(obj);
    return { ok: true, errors: [] };
  }

  /**
   * Promote an object one zone forward, or to an explicit target.
   *
   * Promotion copies the object (the source remains until `removeSource`
   * is passed — mirroring copy-then-delete semantics in real lakes).
   */
  promote(path: string, target?: Zone, removeSource = true): ValidationResult {
    const obj = this._store.get(path);
    if (obj === undefined) return { ok: false, errors: [`Object '${path}' not found`] };
    const fromIdx = ZONE_ORDER.indexOf(obj.zone);
    const to = target ?? ZONE_ORDER[fromIdx + 1];
    if (to === undefined) return { ok: false, errors: [`Already in terminal zone 'curated'`] };
    const toIdx = ZONE_ORDER.indexOf(to);
    if (toIdx <= fromIdx) return { ok: false, errors: [`Cannot promote backwards/sideways (${obj.zone} → ${to})`] };

    // Enforce no-skip unless the source zone's policy grants it — the
    // ingestion side decides whether its objects may fast-track.
    if (toIdx - fromIdx > 1 && this.policy(obj.zone).allowSkip !== true) {
      return { ok: false, errors: [`Skipping intermediate zones not allowed by '${obj.zone}' policy`] };
    }

    const targetPolicy = this.policy(to);
    if (targetPolicy.maxObjectBytes !== undefined && obj.sizeBytes > targetPolicy.maxObjectBytes) {
      const err = [`Object exceeds ${to} max size ${targetPolicy.maxObjectBytes}`];
      this._journal.push({ path, from: obj.zone, to, at: Date.now(), ok: false, errors: err });
      this._quarantine.push({ object: obj, targetZone: to, errors: err, at: Date.now() });
      return { ok: false, errors: err };
    }

    const stagedObj: LakeObject = {
      ...obj,
      zone: to,
      path: `${to}/${stripZonePrefix(path)}`,
      updatedAt: Date.now(),
    };
    const result = this._validate(stagedObj, targetPolicy);
    this._journal.push({ path, from: obj.zone, to, at: Date.now(), ok: result.ok, errors: result.errors });
    if (!result.ok) {
      this._quarantine.push({ object: stagedObj, targetZone: to, errors: result.errors, at: Date.now() });
      return result;
    }
    this._store.put(stagedObj);
    if (removeSource) this._store.delete(path);
    return { ok: true, errors: [] };
  }

  private _validate(obj: LakeObject, policy: ZonePolicy): ValidationResult {
    const errors: string[] = [];
    for (const v of policy.validators) {
      const r = v(obj);
      if (!r.ok) errors.push(...r.errors);
    }
    return { ok: errors.length === 0, errors };
  }
}

/** Extract zone from a path like `raw/events/x`. */
export function zoneOfPath(path: string): Zone | null {
  const head = path.split('/')[0];
  return head === 'raw' || head === 'staged' || head === 'curated' ? head : null;
}

function stripZonePrefix(path: string): string {
  const idx = path.indexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}
