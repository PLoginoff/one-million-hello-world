/**
 * Desired State Store
 *
 * Append-only history of desired-state revisions — the in-memory analog
 * of a git log. Each revision is an immutable snapshot of all declared
 * resources plus commit metadata. Rollback needs the full history, so
 * revisions are never mutated after commit.
 *
 * Lookup is O(1) by revision id and O(log n) by "latest" via the ordered
 * revision list.
 *
 * @module GitopsLayer/Engines
 */

import { CommitMeta, DesiredRevision, IClock, ResourceSpec, resourceKey, SystemClock } from './types';

let revSeq = 0;

export class DesiredStateStore {
  private readonly _revisions: Map<string, DesiredRevision>;
  /** Revision ids in commit order (oldest → newest). */
  private readonly _order: string[];
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._revisions = new Map();
    this._order = [];
    this._clock = clock;
  }

  /**
   * Commit a new desired-state revision. Resources are deep-copied so
   * later caller mutation can't rewrite history.
   */
  commit(commit: Omit<CommitMeta, 'timestamp'>, resources: ReadonlyArray<ResourceSpec>): DesiredRevision {
    revSeq += 1;
    const id = `rev-${revSeq.toString(36)}`;
    const map = new Map<string, ResourceSpec>();
    for (const r of resources) {
      map.set(resourceKey(r.kind, r.name), {
        kind: r.kind,
        name: r.name,
        spec: structuredClone(r.spec),
        dependsOn: [...r.dependsOn],
        wave: r.wave,
      });
    }
    const rev: DesiredRevision = {
      id,
      commit: { ...commit, timestamp: this._clock.now() },
      resources: map,
    };
    this._revisions.set(id, rev);
    this._order.push(id);
    return rev;
  }

  get(revisionId: string): DesiredRevision | null {
    return this._revisions.get(revisionId) ?? null;
  }

  /** Newest revision, or null when nothing committed. */
  head(): DesiredRevision | null {
    if (this._order.length === 0) return null;
    return this._revisions.get(this._order[this._order.length - 1]!) ?? null;
  }

  /** Revision immediately before `revisionId` — for rollback. */
  previous(revisionId: string): DesiredRevision | null {
    const idx = this._order.indexOf(revisionId);
    if (idx <= 0) return null;
    return this._revisions.get(this._order[idx - 1]!) ?? null;
  }

  /** Revision immediately after `revisionId` — for roll-forward. */
  next(revisionId: string): DesiredRevision | null {
    const idx = this._order.indexOf(revisionId);
    if (idx === -1 || idx === this._order.length - 1) return null;
    return this._revisions.get(this._order[idx + 1]!) ?? null;
  }

  history(): ReadonlyArray<DesiredRevision> {
    return this._order.map((id) => this._revisions.get(id)!);
  }

  count(): number {
    return this._order.length;
  }
}
