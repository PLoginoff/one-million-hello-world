/**
 * SchemaRegistryEngine — facade over SubjectStore + CompatibilityChecker.
 *
 * API mirrors a real schema registry:
 *   register(subject, schema, refs?)  -> compat check + version assign
 *   checkCompatibility(...)           -> dry-run without registering
 *   latest/getVersion/getById         -> fetch paths
 *   setCompatibility                  -> per-subject mode override
 *   softDelete/hardDelete             -> lifecycle management
 *   dependenciesOf/dependentsOf       -> reference graph queries
 *
 * Transitive modes check the candidate against EVERY live prior version;
 * non-transitive modes check only the latest.
 *
 * @module SchemaRegistry/Registry
 */

import {
  CompatibilityMode,
  CompatibilityReport,
  RegistrationResult,
  SchemaReference,
  SchemaVersion,
  RegistryConfig,
  DEFAULT_REGISTRY_CONFIG,
  RegistryError,
  SchemaRegistryErrorCode,
} from './types';
import { SubjectStore } from './SubjectStore';
import { CompatibilityChecker } from './CompatibilityChecker';
import { fingerprint } from './SchemaModel';

export class SchemaRegistryEngine {
  private readonly _store: SubjectStore;
  private readonly _checker: CompatibilityChecker;
  private readonly _config: RegistryConfig;
  private readonly _now: () => number;

  constructor(config?: Partial<RegistryConfig>, now: () => number = Date.now) {
    this._config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this._store = new SubjectStore();
    this._checker = new CompatibilityChecker(this._config.allowNumericWidening);
    this._now = now;
  }

  get store(): SubjectStore {
    return this._store;
  }

  /** Effective compat mode for a subject (explicit or registry default). */
  compatibilityFor(subject: string): CompatibilityMode {
    return this._store.getSubject(subject)?.compatibility ?? this._config.defaultCompatibility;
  }

  /**
   * Dry-run compatibility of `schema` as the next version of `subject`.
   */
  checkCompatibility(subject: string, schema: unknown, mode?: CompatibilityMode): CompatibilityReport {
    const effective = mode ?? this.compatibilityFor(subject);
    if (effective === CompatibilityMode.NONE) {
      return { compatible: true, violations: [], diffs: [] };
    }
    const priors = this._priorsForCheck(subject, effective);
    if (priors.length === 0) {
      return { compatible: true, violations: [], diffs: [] };
    }
    const merged: CompatibilityReport = { compatible: true, violations: [], diffs: [] };
    for (const prior of priors) {
      const r = this._checker.check(prior.schema, schema, effective);
      if (!r.compatible) merged.compatible = false;
      merged.violations.push(...r.violations.map((v) => `vs v${prior.version}: ${v}`));
      for (const d of r.diffs) {
        if (!merged.diffs.some((x) => x.kind === d.kind && x.path === d.path)) merged.diffs.push(d);
      }
    }
    return merged;
  }

  /** Prior versions to check: latest only, or all live (transitive). */
  private _priorsForCheck(subject: string, mode: CompatibilityMode): SchemaVersion[] {
    const transitive =
      mode === CompatibilityMode.BACKWARD_TRANSITIVE ||
      mode === CompatibilityMode.FORWARD_TRANSITIVE ||
      mode === CompatibilityMode.FULL_TRANSITIVE;
    if (transitive) return this._store.liveVersions(subject);
    const latest = this._store.latest(subject);
    return latest ? [latest] : [];
  }

  /**
   * Register a schema under a subject. Creates the subject on first use.
   * Enforces compatibility; idempotent on identical canonical content.
   */
  register(subject: string, schema: unknown, references: SchemaReference[] = []): RegistrationResult {
    const existing = this._store.getSubject(subject);
    const mode = existing?.compatibility ?? this._config.defaultCompatibility;
    if (!existing) {
      this._store.createSubject(subject, mode, this._now());
    } else if (existing.deleted) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_DELETED, `subject '${subject}' is soft-deleted`);
    }

    const report = this.checkCompatibility(subject, schema, mode);
    if (!report.compatible) {
      throw new RegistryError(
        SchemaRegistryErrorCode.INCOMPATIBLE,
        `schema incompatible (${mode}): ${report.violations.join('; ')}`,
        { violations: report.violations }
      );
    }

    const { version, alreadyRegistered } = this._store.appendVersion(subject, schema, references, this._now());
    return {
      id: version.id,
      subject,
      version: version.version,
      alreadyRegistered,
      compatibility: report,
    };
  }

  /** Fetch APIs. */
  latest(subject: string): SchemaVersion {
    const v = this._store.latest(subject);
    if (!v) {
      throw new RegistryError(SchemaRegistryErrorCode.SUBJECT_NOT_FOUND, `no live versions for '${subject}'`);
    }
    return v;
  }

  getVersion(subject: string, version: number): SchemaVersion {
    const v = this._store.getVersion(subject, version);
    if (!v) {
      throw new RegistryError(
        SchemaRegistryErrorCode.VERSION_NOT_FOUND,
        `version ${subject}:${version} not found`
      );
    }
    return v;
  }

  getById(id: number): SchemaVersion {
    const v = this._store.getVersionById(id);
    if (!v) {
      throw new RegistryError(SchemaRegistryErrorCode.SCHEMA_NOT_FOUND, `schema id ${id} not found`);
    }
    return v;
  }

  /** Find a registered version by schema content (fingerprint lookup). */
  lookupSchema(subject: string, schema: unknown): SchemaVersion | undefined {
    return this._store.findByFingerprint(subject, fingerprint(schema));
  }

  setCompatibility(subject: string, mode: CompatibilityMode): void {
    this._store.setCompatibility(subject, mode);
  }

  /** Soft-delete subject; returns versions tombstoned. */
  deleteSubject(subject: string): number {
    return this._store.softDeleteSubject(subject);
  }

  deleteVersion(subject: string, version: number): void {
    this._store.softDeleteVersion(subject, version);
  }

  undeleteSubject(subject: string): void {
    this._store.undeleteSubject(subject);
  }

  /** Irreversible — subject must be soft-deleted and dependency-free. */
  hardDeleteSubject(subject: string): void {
    this._store.hardDeleteSubject(subject);
  }

  dependenciesOf(subject: string): string[] {
    return this._store.graph.dependenciesOf(subject);
  }

  dependentsOf(subject: string): string[] {
    return this._store.graph.dependentsOf(subject);
  }

  subjects(includeDeleted = false): string[] {
    return this._store.subjects(includeDeleted);
  }

  stats(): { subjects: number; versions: number; edges: number } {
    return this._store.stats();
  }
}
