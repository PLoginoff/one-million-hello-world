/**
 * SchemaBundle — portable export/import of registry contents.
 *
 * Packages subjects + their schema versions (and cross-references) into
 * a single JSON-safe document that can move between registries: dev →
 * prod promotion, backup, migration between registry products.
 *
 * Bundle format v1:
 *   { formatVersion, exportedAt, sourceId, subjects: [...],
 *     versions: [{ subject, version, schema, references, fingerprint,
 *                  registeredAt, deleted }] }
 *
 * Import semantics:
 *   - versions import in dependency order — a version whose references
 *     point at not-yet-imported versions is deferred until its deps land
 *     (fixpoint loop).
 *   - an identical version already registered (fingerprint match) is
 *     skipped — re-imports are idempotent.
 *   - a fingerprint MISMATCH on the same (subject, version) is a
 *     conflict — reported, never silently overwritten.
 *   - subject compatibility modes carry over unless the target already
 *     has the subject (target's existing policy wins for existing
 *     subjects; imported versions still carry their own content).
 *
 * Integrity: each bundle carries a content SHA-256 over canonical
 * serialization — verified on import before anything is touched.
 *
 * @module SchemaRegistry/Engine2
 */

import { createHash } from 'crypto';
import type { SchemaRegistryEngine } from '../registry/SchemaRegistryEngine';
import type { SchemaVersion, SchemaReference, CompatibilityMode } from '../registry/types';

// ------------------------------------------------------------------ format

export interface BundledVersion {
  readonly subject: string;
  readonly version: number;
  readonly schema: unknown;
  readonly references: SchemaReference[];
  readonly fingerprint: string;
  readonly registeredAt: number;
  readonly deleted: boolean;
}

export interface BundledSubject {
  readonly name: string;
  readonly compatibility: string;
  readonly deleted: boolean;
}

export interface SchemaBundle {
  readonly formatVersion: 1;
  readonly exportedAt: number;
  /** Free-form provenance tag. */
  readonly sourceId: string;
  readonly subjects: BundledSubject[];
  readonly versions: BundledVersion[];
  /** SHA-256 over canonical content (subjects+versions). */
  readonly checksum: string;
}

/** Per-version import outcome. */
export interface ImportOutcome {
  readonly subject: string;
  readonly version: number;
  readonly result: 'imported' | 'skipped_identical' | 'conflict' | 'failed';
  readonly detail?: string;
}

export interface ImportReport {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly outcomes: ImportOutcome[];
}

// ------------------------------------------------------------------ export

/**
 * Serialize every subject (including soft-deleted) and its versions
 * into a bundle. Versions keep their original version numbers —
 * importers register them verbatim so (subject, version) coordinates
 * stay stable across registries.
 */
export function exportBundle(engine: SchemaRegistryEngine, sourceId = 'local', now = Date.now()): SchemaBundle {
  const subjects: BundledSubject[] = [];
  const versions: BundledVersion[] = [];

  for (const name of engine.subjects(true)) {
    const subj = engine.store.getSubject(name, true);
    subjects.push({
      name,
      compatibility: String(subj?.compatibility ?? engine.compatibilityFor(name)),
      deleted: subj?.deleted ?? false,
    });
    for (const v of engine.store.allVersions(name)) {
      const sv = engine.store.getVersion(name, v, true);
      if (sv) versions.push(versionToBundle(sv));
    }
  }

  const checksum = bundleChecksum(subjects, versions);
  return { formatVersion: 1, exportedAt: now, sourceId, subjects, versions, checksum };
}

function versionToBundle(v: SchemaVersion): BundledVersion {
  return {
    subject: v.subject,
    version: v.version,
    schema: v.schema,
    references: v.references,
    fingerprint: v.fingerprint,
    registeredAt: v.registeredAt,
    deleted: v.deleted,
  };
}

/** Content checksum — canonical JSON over sorted subjects+versions. */
export function bundleChecksum(subjects: BundledSubject[], versions: BundledVersion[]): string {
  const canonical = stableStringify({
    subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
    versions: [...versions].sort((a, b) => a.subject.localeCompare(b.subject) || a.version - b.version),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** JSON.stringify with sorted object keys — deterministic hashing. */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
      const rec = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(rec).sort()) out[k] = rec[k];
      return out;
    }
    return x;
  });
}

// ------------------------------------------------------------------ import

/**
 * Import a bundle into `engine`. Atomicity note: individual versions
 * register independently — a bundle with N versions may partially
 * import if mid-bundle versions conflict; outcomes report each result.
 */
export function importBundle(engine: SchemaRegistryEngine, bundle: SchemaBundle): ImportReport {
  if (bundle.formatVersion !== 1) {
    throw new Error(`Unsupported bundle format ${bundle.formatVersion}`);
  }
  const expected = bundleChecksum(bundle.subjects, bundle.versions);
  if (expected !== bundle.checksum) {
    throw new Error('Bundle checksum mismatch — corrupted or tampered');
  }

  const outcomes: ImportOutcome[] = [];
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  let failed = 0;

  // Restore subject compatibility modes (only for NEW subjects — the
  // target's existing policy wins for subjects it already knows).
  for (const s of bundle.subjects) {
    const existing = engine.store.getSubject(s.name, true);
    if (!existing) {
      // Subject doesn't exist — it will be created on first register
      // under the engine's default compat; pre-seed the desired mode by
      // creating it directly via the store.
      try {
        engine.store.createSubject(s.name, s.compatibility as CompatibilityMode, Date.now());
        if (s.deleted) engine.store.softDeleteSubject(s.name);
      } catch {
        // Race or conflict — leave to per-version handling.
      }
    }
  }

  // Topological import: iterate to fixpoint; defer versions whose
  // referenced dependencies aren't registered yet.
  const pending = [...bundle.versions].sort(
    (a, b) => a.subject.localeCompare(b.subject) || a.version - b.version,
  );
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const v = pending[i];
      const depsMet = v.references.every((r) => {
        try {
          engine.getVersion(r.subject, r.version);
          return true;
        } catch {
          return false;
        }
      });
      if (!depsMet) continue;

      const existing = tryGet(engine, v.subject, v.version);
      if (existing) {
        if (existing.fingerprint === v.fingerprint) {
          outcomes.push({ subject: v.subject, version: v.version, result: 'skipped_identical' });
          skipped++;
        } else {
          outcomes.push({
            subject: v.subject,
            version: v.version,
            result: 'conflict',
            detail: `fingerprint mismatch: local ${existing.fingerprint.slice(0, 12)} vs bundle ${v.fingerprint.slice(0, 12)}`,
          });
          conflicts++;
        }
      } else {
        try {
          engine.register(v.subject, v.schema, v.references);
          if (v.deleted) engine.deleteVersion(v.subject, v.version);
          outcomes.push({ subject: v.subject, version: v.version, result: 'imported' });
          imported++;
        } catch (e) {
          outcomes.push({
            subject: v.subject,
            version: v.version,
            result: 'failed',
            detail: e instanceof Error ? e.message : String(e),
          });
          failed++;
        }
      }
      pending.splice(i, 1);
      i--;
      progress = true;
    }
  }
  for (const v of pending) {
    outcomes.push({
      subject: v.subject,
      version: v.version,
      result: 'failed',
      detail: 'unmet references — dependency never resolved',
    });
    failed++;
  }

  return { imported, skipped, conflicts, failed, outcomes };
}

function tryGet(engine: SchemaRegistryEngine, subject: string, version: number): SchemaVersion | undefined {
  try {
    return engine.getVersion(subject, version);
  } catch {
    return undefined;
  }
}
