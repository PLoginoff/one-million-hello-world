/**
 * API Versioning — Migration Guides
 *
 * Structured metadata about how to move between versions: breaking changes,
 * field renames, behaviour deltas and step-by-step instructions. A
 * `MigrationGuide` links two versions; the `MigrationGuideRegistry` answers
 * "what do I need to know to go from v1 to v3?" — composing multi-hop
 * paths through the version graph when a direct guide doesn't exist.
 *
 * Path composition: a client on `1.x` targeting `3.x` gets the composed
 * sequence [1→2, 2→3] via BFS over the guide graph (shortest hop count —
 * fewest migrations beats "newest intermediate"). Cycles are impossible
 * (guides point forward in version order, enforced at registration).
 *
 * @module ApiVersioning/Negotiation
 */

import { SemVer } from './SemVer';

/** A single documented breaking/non-breaking change. */
export interface MigrationChange {
  /** Short id, e.g. 'field-renamed'. */
  readonly kind: 'breaking' | 'behavior' | 'feature-added' | 'field-renamed' | 'field-removed' | 'type-changed';
  /** What changed — 'user.name → user.fullName'. */
  readonly description: string;
  /** JSON-path-ish location where relevant. */
  readonly path?: string;
  /** Migration hint — 'send fullName instead'. */
  readonly remedy?: string;
}

export interface MigrationGuide {
  /** From this version… */
  readonly from: string;
  /** …to this version. Must be a *forward* step (from < to semver-wise
   *  when both parse as semver). */
  readonly to: string;
  /** Human title. */
  readonly title: string;
  /** Canonical URL of the full guide. */
  readonly url?: string;
  /** Estimated effort bucket. */
  readonly effort?: 'trivial' | 'moderate' | 'significant';
  /** Ordered migration steps. */
  readonly steps?: ReadonlyArray<string>;
  /** Documented changes. */
  readonly changes?: ReadonlyArray<MigrationChange>;
}

/** A composed multi-hop migration path. */
export interface MigrationPath {
  /** Ordered versions: [from, ..., to]. */
  readonly hops: ReadonlyArray<string>;
  /** The guides composing the path. */
  readonly guides: ReadonlyArray<MigrationGuide>;
  /** All changes across hops, source-tagged. */
  readonly changes: ReadonlyArray<MigrationChange & { hopFrom: string; hopTo: string }>;
  readonly effort: 'trivial' | 'moderate' | 'significant';
  /** True when any hop has breaking changes. */
  readonly breaking: boolean;
}

const EFFORT_RANK = { trivial: 0, moderate: 1, significant: 2 } as const;

export class MigrationGuideRegistry {
  private readonly _guides = new Map<string, MigrationGuide>();

  /** Register a guide. Keyed `from→to`; re-registration replaces. */
  register(guide: MigrationGuide): void {
    let fromV: SemVer | null = null;
    let toV: SemVer | null = null;
    try {
      fromV = SemVer.coerce(guide.from) ?? null;
      toV = SemVer.coerce(guide.to) ?? null;
    } catch {
      fromV = null;
      toV = null;
    }
    if (fromV && toV && !fromV.lt(toV)) {
      throw new Error(`migration guide must go forward: ${guide.from} → ${guide.to} is not`);
    }
    this._guides.set(`${guide.from}→${guide.to}`, guide);
  }

  /** Direct guide for a hop, if registered. */
  guide(from: string, to: string): MigrationGuide | undefined {
    return this._guides.get(`${from}→${to}`);
  }

  /** All outgoing guides from a version. */
  outgoing(from: string): MigrationGuide[] {
    return Array.from(this._guides.values()).filter((g) => g.from === from);
  }

  /**
   * Compose the shortest migration path `from → to` via BFS over registered
   * guides. Returns undefined when no path exists. A direct guide wins over
   * any multi-hop route automatically (BFS explores shortest-first).
   */
  path(from: string, to: string): MigrationPath | undefined {
    if (from === to) {
      return { hops: [from], guides: [], changes: [], effort: 'trivial', breaking: false };
    }
    // BFS — frontier entries are (version, path-so-far).
    const visited = new Set<string>([from]);
    const queue: Array<{ version: string; guides: MigrationGuide[] }> = [{ version: from, guides: [] }];
    while (queue.length > 0) {
      const { version, guides } = queue.shift() as { version: string; guides: MigrationGuide[] };
      for (const g of this.outgoing(version)) {
        if (visited.has(g.to)) continue;
        const next = [...guides, g];
        if (g.to === to) {
          return this._compose(next);
        }
        visited.add(g.to);
        queue.push({ version: g.to, guides: next });
      }
    }
    return undefined;
  }

  /** Every version that can reach `to` — the upgrade audience. */
  canReach(to: string): string[] {
    const out: string[] = [];
    const froms = new Set(Array.from(this._guides.values()).map((g) => g.from));
    for (const f of froms) {
      if (this.path(f, to) !== undefined) out.push(f);
    }
    return out;
  }

  guides(): ReadonlyArray<MigrationGuide> {
    return Array.from(this._guides.values());
  }

  private _compose(guides: MigrationGuide[]): MigrationPath {
    const hops = [guides[0].from, ...guides.map((g) => g.to)];
    const changes: Array<MigrationChange & { hopFrom: string; hopTo: string }> = [];
    let effort: MigrationPath['effort'] = 'trivial';
    let breaking = false;
    for (const g of guides) {
      for (const c of g.changes ?? []) {
        changes.push({ ...c, hopFrom: g.from, hopTo: g.to });
        if (c.kind === 'breaking' || c.kind === 'field-removed' || c.kind === 'field-renamed' || c.kind === 'type-changed') {
          breaking = true;
        }
      }
      const e = g.effort ?? 'trivial';
      if (EFFORT_RANK[e] > EFFORT_RANK[effort]) effort = e;
    }
    return { hops, guides, changes, effort, breaking };
  }
}
