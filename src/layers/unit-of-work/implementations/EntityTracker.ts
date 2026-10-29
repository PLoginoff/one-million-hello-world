/**
 * EntityTracker — identity map + change tracking for a unit of work.
 *
 * The tracker records every entity the unit of work has seen, along with:
 *   - a state transition: CLEAN → ADDED / MODIFIED / REMOVED → CLEAN
 *   - an immutable snapshot taken at attach time (for dirty checking)
 *   - a version stamp for optimistic concurrency
 *
 * State machine:
 *   attach(entity)          → CLEAN   (loaded from store)
 *   registerNew(entity)     → ADDED
 *   registerDirty(entity)   → MODIFIED (or stays ADDED)
 *   registerRemoved(entity) → REMOVED  (ADDED → DETACHED, since a new
 *                                       entity that is removed was never
 *                                       persisted)
 *   acceptAllChanges()      → all → CLEAN, snapshots refreshed
 *
 * Dirty checking: for CLEAN entities we deep-diff the current state
 * against the attach-time snapshot. Structural equality via a stable
 * serializer — nested objects, arrays, and primitives handled; functions
 * and class instances are treated by their enumerable properties.
 *
 * Keys: each entity is identified by `{type, id}` — the type is the
 * aggregate/entity category, id is its primary key. The identity map
 * guarantees `getOrAttach` returns the same tracked instance for a key.
 *
 * @module UnitOfWorkLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** Tracked entity lifecycle states. */
export type EntityState = 'clean' | 'added' | 'modified' | 'removed' | 'detached';

/** An entity the unit of work can track — needs an id + type tag. */
export interface TrackableEntity {
  /** Primary key within its type. */
  readonly id: string;
  /** Type/category discriminator, e.g. 'order', 'customer'. */
  readonly entityType: string;
  /** Optimistic-concurrency version — bumped on each persisted write. */
  readonly version: number;
}

/** Internal tracking record. */
export interface TrackedEntry<T extends TrackableEntity = TrackableEntity> {
  /** The live entity reference. */
  readonly entity: T;
  /** Entity type. */
  readonly entityType: string;
  /** Entity id. */
  readonly id: string;
  /** Current tracking state. */
  state: EntityState;
  /** Immutable snapshot captured at attach time (deep clone). */
  snapshot: Record<string, unknown>;
  /** Version at attach time — for optimistic concurrency checks. */
  attachedVersion: number;
  /** Ordering counter for deterministic iteration. */
  readonly attachedAt: number;
}

/** Changes computed by dirty checking / explicit registration. */
export interface ChangeSet<T extends TrackableEntity = TrackableEntity> {
  readonly added: TrackedEntry<T>[];
  readonly modified: TrackedEntry<T>[];
  readonly removed: TrackedEntry<T>[];
  /** Fields that differ per modified entity — for UPDATE column lists. */
  readonly changedFields: Map<TrackedEntry<T>, string[]>;
}

// ------------------------------------------------------------ serialization

/**
 * Structural deep clone. Preserves JSON-shaped data; Date becomes ISO
 * string; Map/Set become arrays; functions are dropped.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(deepClone) as T;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (typeof v === 'function') continue;
    out[k] = deepClone(v);
  }
  return out as T;
}

/**
 * Deep structural equality. Same normalization rules as deepClone.
 * O(size of smaller tree) short-circuit on first difference.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => typeof ra[k] !== 'function');
  const kb = Object.keys(rb).filter((k) => typeof rb[k] !== 'function');
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!(k in rb)) return false;
    if (!deepEqual(ra[k], rb[k])) return false;
  }
  return true;
}

/**
 * Diff two snapshots — returns the top-level field names whose values
 * differ. Nested changes report the top-level field (sufficient for
 * UPDATE column lists).
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (!deepEqual(before[k], after[k])) changed.push(k);
  }
  return changed;
}

// ---------------------------------------------------------------- tracker

let _attachCounter = 0;

export class EntityTracker<T extends TrackableEntity = TrackableEntity> {
  /** key = `${entityType}:${id}` */
  private readonly _entries = new Map<string, TrackedEntry<T>>();

  private static _key(entityType: string, id: string): string {
    return `${entityType}:${id}`;
  }

  /** Number of tracked entities. */
  get size(): number {
    return this._entries.size;
  }

  /**
   * Attach a loaded entity as CLEAN. Returns the tracked instance — if an
   * entry already exists for this key, returns the EXISTING entity
   * (identity-map semantics: one instance per key per unit of work).
   */
  attach(entity: T): T {
    const key = EntityTracker._key(entity.entityType, entity.id);
    const existing = this._entries.get(key);
    if (existing) return existing.entity;
    const entry: TrackedEntry<T> = {
      entity,
      entityType: entity.entityType,
      id: entity.id,
      state: 'clean',
      snapshot: deepClone(entity) as Record<string, unknown>,
      attachedVersion: entity.version,
      attachedAt: ++_attachCounter,
    };
    this._entries.set(key, entry);
    return entity;
  }

  /** Whether an entity is tracked (any state). */
  isTracked(entityType: string, id: string): boolean {
    return this._entries.has(EntityTracker._key(entityType, id));
  }

  /** Get a tracked entity by key, or undefined. */
  get(entityType: string, id: string): T | undefined {
    return this._entries.get(EntityTracker._key(entityType, id))?.entity;
  }

  /** Get the tracking entry by key. */
  entry(entityType: string, id: string): TrackedEntry<T> | undefined {
    return this._entries.get(EntityTracker._key(entityType, id));
  }

  /** Mark a new entity — will be INSERTed on commit. */
  registerNew(entity: T): void {
    const key = EntityTracker._key(entity.entityType, entity.id);
    if (this._entries.has(key)) {
      throw new Error(`Entity '${key}' is already tracked`);
    }
    const entry: TrackedEntry<T> = {
      entity,
      entityType: entity.entityType,
      id: entity.id,
      state: 'added',
      snapshot: deepClone(entity) as Record<string, unknown>,
      attachedVersion: entity.version,
      attachedAt: ++_attachCounter,
    };
    this._entries.set(key, entry);
  }

  /** Explicitly mark an entity dirty. */
  registerDirty(entity: T): void {
    const entry = this._entries.get(EntityTracker._key(entity.entityType, entity.id));
    if (!entry) {
      // Auto-attach then mark.
      this.attach(entity);
      const e = this._entries.get(EntityTracker._key(entity.entityType, entity.id));
      if (e) e.state = 'modified';
      return;
    }
    if (entry.state === 'clean') entry.state = 'modified';
  }

  /** Mark an entity for removal — will be DELETEd on commit. */
  registerRemoved(entity: T): void {
    const entry = this._entries.get(EntityTracker._key(entity.entityType, entity.id));
    if (!entry) {
      this.attach(entity);
      const e = this._entries.get(EntityTracker._key(entity.entityType, entity.id));
      if (e) e.state = 'removed';
      return;
    }
    if (entry.state === 'added') {
      // Added then removed before commit → detach entirely.
      entry.state = 'detached';
      return;
    }
    entry.state = 'removed';
  }

  /** Detach — stop tracking without persisting. */
  detach(entityType: string, id: string): boolean {
    const key = EntityTracker._key(entityType, id);
    const entry = this._entries.get(key);
    if (!entry) return false;
    entry.state = 'detached';
    this._entries.delete(key);
    return true;
  }

  /**
   * Compute the change set. For CLEAN entries, run snapshot-diff to
   * detect implicit modifications.
   */
  changeSet(): ChangeSet<T> {
    const added: TrackedEntry<T>[] = [];
    const modified: TrackedEntry<T>[] = [];
    const removed: TrackedEntry<T>[] = [];
    const changedFields = new Map<TrackedEntry<T>, string[]>();

    for (const entry of this._entries.values()) {
      if (entry.state === 'added') {
        added.push(entry);
      } else if (entry.state === 'removed') {
        removed.push(entry);
      } else if (entry.state === 'detached') {
        continue;
      } else {
        // clean or explicit modified — verify via snapshot diff.
        const current = deepClone(entry.entity) as Record<string, unknown>;
        const fields = diffFields(entry.snapshot, current);
        if (entry.state === 'modified' || fields.length > 0) {
          modified.push(entry);
          changedFields.set(entry, fields);
        }
      }
    }

    // Deterministic ordering: attach order.
    const byAttach = (a: TrackedEntry<T>, b: TrackedEntry<T>) => a.attachedAt - b.attachedAt;
    added.sort(byAttach);
    modified.sort(byAttach);
    removed.sort(byAttach);

    return { added, modified, removed, changedFields };
  }

  /** Whether there are any pending changes. */
  hasChanges(): boolean {
    const cs = this.changeSet();
    return cs.added.length > 0 || cs.modified.length > 0 || cs.removed.length > 0;
  }

  /**
   * Mark all entries CLEAN after a successful commit. Refreshes each
   * snapshot to the current state.
   */
  acceptAllChanges(): void {
    for (const [key, entry] of this._entries) {
      if (entry.state === 'removed' || entry.state === 'detached') {
        this._entries.delete(key);
        continue;
      }
      entry.state = 'clean';
      entry.snapshot = deepClone(entry.entity) as Record<string, unknown>;
      entry.attachedVersion = entry.entity.version;
    }
  }

  /** All tracked entries (for diagnostics). */
  entries(): readonly TrackedEntry<T>[] {
    return [...this._entries.values()];
  }

  /** Clear all tracking. */
  clear(): void {
    this._entries.clear();
  }
}
