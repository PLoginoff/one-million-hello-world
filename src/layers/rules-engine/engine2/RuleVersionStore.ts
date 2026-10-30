/**
 * Rules Engine — Rule-Set Versioning
 *
 * An append-only versioned store for {@link RuleSet}s. Semantics:
 *
 *  - Each `publish` creates an immutable, monotonically numbered version.
 *    Versions are NEVER mutated in place — a rule-set edit produces a new
 *    version (the model for safe rollouts: pin consumers to a version,
 *    upgrade explicitly, roll back instantly).
 *  - `checkout(version)` returns the immutable snapshot — the same object
 *    reference is handed out; callers must treat it as read-only (the
 *    store deep-freezes on publish).
 *  - `diff(a, b)` produces a structural diff: added/removed/changed rules,
 *    so change review doesn't require eyeballing JSON.
 *  - `rollbackTo(version)` publishes a NEW version whose content equals
 *    the target — history is never rewritten.
 *
 * Lineage is tracked for audit: each version records its parent and an
 * optional changelog message.
 *
 * @module RulesEngine/Engine2
 */

import { Condition } from '../domain/dsl';

/** A rule in a versioned set — engine-agnostic shape (id + condition + action descriptor). */
export interface VersionedRule {
  readonly id: string;
  readonly description?: string;
  readonly condition: Condition;
  /** Serialized action descriptor (opaque — the store doesn't interpret it). */
  readonly action: string;
  readonly priority?: number;
  readonly tags?: ReadonlyArray<string>;
}

export interface RuleSet {
  readonly name: string;
  readonly rules: ReadonlyArray<VersionedRule>;
}

export interface RuleSetVersion {
  readonly version: number;
  readonly name: string;
  readonly rules: ReadonlyArray<VersionedRule>;
  readonly parent: number | null;
  readonly changelog: string;
  readonly publishedAt: number;
}

export type RuleChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export interface RuleChange {
  readonly ruleId: string;
  readonly kind: RuleChangeKind;
  /** For modified: the fields that differ. */
  readonly changedFields?: ReadonlyArray<string>;
}

export interface RuleSetDiff {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changes: ReadonlyArray<RuleChange>;
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
}

export class RuleVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleVersionError';
  }
}

/** Structural compare for rules — JSON for condition+action, direct for scalars. */
function rulesEqual(a: VersionedRule, b: VersionedRule): boolean {
  return changedFields(a, b).length === 0;
}

function changedFields(a: VersionedRule, b: VersionedRule): string[] {
  const fields: string[] = [];
  if (a.action !== b.action) fields.push('action');
  if ((a.priority ?? 0) !== (b.priority ?? 0)) fields.push('priority');
  if (a.description !== b.description) fields.push('description');
  if (JSON.stringify(a.condition) !== JSON.stringify(b.condition)) fields.push('condition');
  if (JSON.stringify(a.tags ?? []) !== JSON.stringify(b.tags ?? [])) fields.push('tags');
  return fields;
}

/** Deep-freeze a rule set so published snapshots can't be mutated. */
function freezeRuleSet(set: RuleSet): ReadonlyArray<VersionedRule> {
  return Object.freeze(
    set.rules.map((r) => Object.freeze({ ...r, condition: Object.freeze(r.condition) }))
  ) as ReadonlyArray<VersionedRule>;
}

export class RuleVersionStore {
  private readonly _name: string;
  private readonly _clock: () => number;
  private readonly _versions = new Map<number, RuleSetVersion>();
  private _latest = 0;

  constructor(name: string, clock: () => number = Date.now) {
    this._name = name;
    this._clock = clock;
  }

  get name(): string {
    return this._name;
  }

  get latestVersion(): number {
    return this._latest;
  }

  get versionCount(): number {
    return this._versions.size;
  }

  /**
   * Publish a new version of the rule set.
   * Rule ids must be unique within a version.
   */
  publish(set: RuleSet, changelog = ''): RuleSetVersion {
    if (set.name !== this._name) {
      throw new RuleVersionError(`rule set name '${set.name}' does not match store '${this._name}'`);
    }
    const ids = new Set<string>();
    for (const r of set.rules) {
      if (ids.has(r.id)) throw new RuleVersionError(`duplicate rule id '${r.id}' in version`);
      ids.add(r.id);
    }
    const version = this._latest + 1;
    const v: RuleSetVersion = {
      version,
      name: set.name,
      rules: freezeRuleSet(set),
      parent: this._latest === 0 ? null : this._latest,
      changelog,
      publishedAt: this._clock(),
    };
    this._versions.set(version, v);
    this._latest = version;
    return v;
  }

  /** Fetch a version (latest when omitted). Throws when absent. */
  checkout(version?: number): RuleSetVersion {
    const v = this._versions.get(version ?? this._latest);
    if (!v) {
      throw new RuleVersionError(`no version ${version ?? this._latest} in '${this._name}'`);
    }
    return v;
  }

  /** All versions, ascending. */
  history(): ReadonlyArray<RuleSetVersion> {
    return [...this._versions.values()].sort((a, b) => a.version - b.version);
  }

  /**
   * Structural diff between two versions. Rules match by id; a rule present
   * in both with different fields is 'modified'.
   */
  diff(fromVersion: number, toVersion: number): RuleSetDiff {
    const a = this.checkout(fromVersion);
    const b = this.checkout(toVersion);
    const aRules = new Map(a.rules.map((r) => [r.id, r]));
    const bRules = new Map(b.rules.map((r) => [r.id, r]));
    const changes: RuleChange[] = [];
    let added = 0, removed = 0, modified = 0;

    for (const [id, rb] of bRules) {
      const ra = aRules.get(id);
      if (!ra) {
        changes.push({ ruleId: id, kind: 'added' });
        added++;
      } else if (!rulesEqual(ra, rb)) {
        changes.push({ ruleId: id, kind: 'modified', changedFields: changedFields(ra, rb) });
        modified++;
      } else {
        changes.push({ ruleId: id, kind: 'unchanged' });
      }
    }
    for (const id of aRules.keys()) {
      if (!bRules.has(id)) {
        changes.push({ ruleId: id, kind: 'removed' });
        removed++;
      }
    }
    return { fromVersion, toVersion, changes, added, removed, modified };
  }

  /**
   * Roll back: publish a new version whose rules equal `version`'s.
   * History is preserved — rollback is a forward movement.
   */
  rollbackTo(version: number, changelog = `rollback to v${version}`): RuleSetVersion {
    const target = this.checkout(version);
    // Un-freeze into a fresh set for publish.
    const set: RuleSet = {
      name: this._name,
      rules: target.rules.map((r) => ({ ...r })),
    };
    return this.publish(set, changelog);
  }
}
