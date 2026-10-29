/**
 * SubjectStore — versioned schema storage.
 *
 * Data layout:
 *  - `_subjects`:  subjectName -> Subject meta (compat mode, deleted flag)
 *  - `_versions`:  subjectName -> SchemaVersion[] (1-indexed by position;
 *                  version N lives at index N-1 — stable even across
 *                  soft deletes)
 *  - `_byId`:      global id -> SchemaVersion (O(1) fetch-by-id)
 *  - `_byFingerprint`: subject|fingerprint -> version (idempotent
 *                  re-registration returns the existing version)
 *  - `_graph`:     cross-subject reference DAG
 *
 * Delete semantics:
 *  - softDelete: marks subject/versions deleted; data retained;
 *    registrations rejected, fetches 404. Reversible via `undelete`.
 *  - hardDelete: drops all versions and graph edges. Refused while any
 *    live subject transitively depends on it.
 *
 * @module SchemaRegistry/Registry
 */

import {
  Subject,
  SchemaVersion,
  SchemaReference,
  CompatibilityMode,
  RegistryError,
  SchemaRegistryErrorCode,
} from './types';
import { canonicalizeSchema, fingerprint, validateSchema } from './SchemaModel';
import { ReferenceGraph } from './ReferenceGraph';

export class SubjectStore {
  private readonly _subjects: Map<string, Subject> = new Map();
  private readonly _versions: Map<string, SchemaVersion[]> = new Map();
  private readonly _byId: Map<number, SchemaVersion> = new Map();
  private readonly _byFingerprint: Map<string, number> = new Map();
  readonly graph = new ReferenceGraph();
  private _nextId = 1;

  /** Create a subject (idempotent) with a compat mode. */
  createSubject(name: string, compatibility: CompatibilityMode, now: number = Date.now()): Subject {
    const existing = this._subjects.get(name);
    if (existing) {
      if (existing.deleted) {
        throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_DELETED, `subject '${name}' is soft-deleted`);
      }
      return existing;
    }
    const subject: Subject = { name, compatibility, deleted: false, createdAt: now };
    this._subjects.set(name, subject);
    this._versions.set(name, []);
    return subject;
  }

  /** Subject lookup. */
  getSubject(name: string, includeDeleted = false): Subject | undefined {
    const s = this._subjects.get(name);
    if (!s || (s.deleted && !includeDeleted)) return undefined;
    return s;
  }

  requireSubject(name: string): Subject {
    const s = this.getSubject(name, true);
    if (!s) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_NOT_FOUND, `subject '${name}' not found`);
    }
    if (s.deleted) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_DELETED, `subject '${name}' is soft-deleted`);
    }
    return s;
  }

  setCompatibility(name: string, mode: CompatibilityMode): void {
    this.requireSubject(name).compatibility = mode;
  }

  /**
   * Append a version. Validates schema structure and that references
   * resolve to existing, non-deleted versions; rejects reference cycles.
   *
   * If the canonical fingerprint matches an existing live version the
   * registration is idempotent — returns that version.
   */
  appendVersion(
    subjectName: string,
    schema: unknown,
    references: SchemaReference[],
    now: number = Date.now()
  ): { version: SchemaVersion; alreadyRegistered: boolean } {
    const subject = this.requireSubject(subjectName);
    validateSchema(schema);

    // Resolve references -> must exist & not create cycles
    for (const ref of references) {
      const target = this.getVersion(ref.subject, ref.version);
      if (!target || target.deleted) {
        throw new RegistryError(
          SchemaRegistryErrorCode.REFERENCE_NOT_FOUND,
          `reference ${ref.name} -> ${ref.subject}:${ref.version} not found`
        );
      }
      if (this.graph.wouldCycle(subjectName, ref.subject)) {
        throw new RegistryError(
          SchemaRegistryErrorCode.CIRCULAR_REFERENCE,
          `reference ${subjectName} -> ${ref.subject} would create a cycle`
        );
      }
    }

    const canonical = canonicalizeSchema(schema);
    const fp = fingerprint(schema);
    const fpKey = `${subjectName}|${fp}`;
    const existingVersion = this._byFingerprint.get(fpKey);
    if (existingVersion !== undefined) {
      const existing = this._byId.get(existingVersion);
      if (existing && !existing.deleted) {
        return { version: existing, alreadyRegistered: true };
      }
    }

    const versions = this._versions.get(subjectName)!;
    const v: SchemaVersion = {
      id: this._nextId++,
      subject: subjectName,
      version: versions.length + 1,
      canonical,
      fingerprint: fp,
      schema,
      references: [...references],
      deleted: false,
      registeredAt: now,
    };
    versions.push(v);
    this._byId.set(v.id, v);
    this._byFingerprint.set(fpKey, v.id);
    for (const ref of references) {
      this.graph.addEdge(subjectName, ref.subject);
    }
    void subject;
    return { version: v, alreadyRegistered: false };
  }

  /** Fetch a specific version (soft-deleted versions hidden unless flag). */
  getVersion(subject: string, version: number, includeDeleted = false): SchemaVersion | undefined {
    const list = this._versions.get(subject);
    if (!list || version < 1 || version > list.length) return undefined;
    const v = list[version - 1];
    if (v.deleted && !includeDeleted) return undefined;
    return v;
  }

  getVersionById(id: number, includeDeleted = false): SchemaVersion | undefined {
    const v = this._byId.get(id);
    if (!v || (v.deleted && !includeDeleted)) return undefined;
    return v;
  }

  /** Latest non-deleted version. */
  latest(subject: string): SchemaVersion | undefined {
    const list = this._versions.get(subject);
    if (!list) return undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].deleted) return list[i];
    }
    return undefined;
  }

  /** All non-deleted versions of a subject (for transitive checks). */
  liveVersions(subject: string): SchemaVersion[] {
    return (this._versions.get(subject) ?? []).filter((v) => !v.deleted);
  }

  /** All version numbers ever assigned (including deleted). */
  allVersions(subject: string): number[] {
    return (this._versions.get(subject) ?? []).map((v) => v.version);
  }

  /** Soft-delete a subject and all its versions. */
  softDeleteSubject(name: string): number {
    const subject = this.requireSubject(name);
    subject.deleted = true;
    let n = 0;
    for (const v of this._versions.get(name) ?? []) {
      if (!v.deleted) {
        v.deleted = true;
        n++;
      }
    }
    return n;
  }

  /** Soft-delete a single version. */
  softDeleteVersion(subject: string, version: number): void {
    const v = this.getVersion(subject, version);
    if (!v) {
      throw new RegistryError(
        SchemaRegistryErrorCode.VERSION_NOT_FOUND,
        `version ${subject}:${version} not found`
      );
    }
    v.deleted = true;
  }

  /** Restore a soft-deleted subject (versions stay flagged individually). */
  undeleteSubject(name: string): void {
    const s = this._subjects.get(name);
    if (!s) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_NOT_FOUND, `subject '${name}' not found`);
    }
    s.deleted = false;
  }

  /**
   * Hard-delete a subject: refuse while live dependents exist; drop all
   * version data, fingerprints, and graph edges. Irreversible.
   */
  hardDeleteSubject(name: string): void {
    const s = this._subjects.get(name);
    if (!s) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_NOT_FOUND, `subject '${name}' not found`);
    }
    if (!s.deleted) {
      throw new RegistryError(
        SchemaRegistryErrorCode.INVALID_SCHEMA,
        `subject '${name}' must be soft-deleted before hard delete`
      );
    }
    const dependents = this.graph.dependentsOf(name).filter((d) => {
      const ds = this._subjects.get(d);
      return ds !== undefined && !ds.deleted;
    });
    if (dependents.length > 0) {
      throw new RegistryError(
        SchemaRegistryErrorCode.INVALID_SCHEMA,
        `subject '${name}' has live dependents: ${dependents.join(', ')}`
      );
    }
    for (const v of this._versions.get(name) ?? []) {
      this._byId.delete(v.id);
      this._byFingerprint.delete(`${name}|${v.fingerprint}`);
    }
    this._versions.delete(name);
    this._subjects.delete(name);
    this.graph.removeSubject(name);
  }

  /** Look up a version by fingerprint within a subject. */
  findByFingerprint(subject: string, fp: string): SchemaVersion | undefined {
    const id = this._byFingerprint.get(`${subject}|${fp}`);
    return id !== undefined ? this._byId.get(id) : undefined;
  }

  /** Subject names (optionally including soft-deleted). */
  subjects(includeDeleted = false): string[] {
    const out: string[] = [];
    for (const [name, s] of this._subjects) {
      if (includeDeleted || !s.deleted) out.push(name);
    }
    return out;
  }

  stats(): { subjects: number; versions: number; edges: number } {
    let versions = 0;
    for (const list of this._versions.values()) versions += list.length;
    return { subjects: this._subjects.size, versions, edges: this.graph.edges().length };
  }
}
