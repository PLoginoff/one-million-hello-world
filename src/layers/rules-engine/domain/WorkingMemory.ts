/**
 * Working memory with truth maintenance for the rules engine.
 *
 * Facts are stored flat in a Map keyed by fact id. Every derived fact carries
 * a *justification* — the set of (factId, ruleId) pairs that caused it. When
 * a premise fact is retracted, the Truth Maintenance System (TMS) walks the
 * justification graph and retracts any derived fact whose support has
 * completely disappeared, transitively.
 *
 * This is a simple non-monotonic TMS:
 *  - Asserted ("premise") facts have an empty justification set; they are
 *    only removed by explicit {@link WorkingMemory.retract}.
 *  - Derived facts stay alive while at least one justification is intact.
 *  - Retraction cascades depth-first through dependents.
 *
 * Complexity: assert/retract are O(dependents) via a reverse index; the
 * cascade is O(V + E) over the justification subgraph actually affected.
 *
 * @module RulesEngine/Domain
 */

/** A fact stored in working memory. */
export interface Fact {
  readonly id: string;
  /** Arbitrary payload; conventionally a record, but primitives allowed. */
  readonly data: unknown;
  /** Monotonic insertion counter — used for *recency* conflict resolution. */
  readonly recency: number;
  /** Wall-clock (or injected clock) assertion time. */
  readonly assertedAt: number;
}

/**
 * A single support link: `factId` is believed because `ruleId` fired while
 * `supports` (fact ids) were present.
 */
export interface Justification {
  readonly ruleId: string;
  readonly supports: readonly string[];
}

interface FactNode {
  fact: Fact;
  /** True for facts asserted directly (not derived by a rule). */
  premise: boolean;
  /** All currently-valid justifications for a derived fact. */
  justifications: Justification[];
  /** Ids of facts that list this fact in their supports — reverse index. */
  dependents: Set<string>;
}

/** Change event emitted by the memory for instrumentation/tests. */
export interface WorkingMemoryEvent {
  readonly type: 'asserted' | 'retracted' | 'cascade-retracted';
  readonly factId: string;
  readonly cause: string;
}

export type WorkingMemoryListener = (event: WorkingMemoryEvent) => void;

export class WorkingMemory {
  private readonly _nodes = new Map<string, FactNode>();
  private readonly _listeners: WorkingMemoryListener[] = [];
  private _recencyCounter = 0;
  private readonly _clock: () => number;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  /** Subscribe to memory mutations. Returns an unsubscribe function. */
  onChange(listener: WorkingMemoryListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) {
        this._listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Asserts a *premise* fact (ground truth, not derived from a rule).
   * Re-asserting an existing id updates the data but keeps premise status.
   */
  assert(id: string, data: unknown): Fact {
    const existing = this._nodes.get(id);
    if (existing && existing.premise) {
      existing.fact = this._makeFact(id, data);
      this._emit({ type: 'asserted', factId: id, cause: 're-assert' });
      return existing.fact;
    }
    if (existing && !existing.premise) {
      // A derived fact being promoted to a premise: keep derived dependents,
      // but mark it as ground truth so retractions no longer cascade to it.
      existing.premise = true;
      existing.justifications = [];
      existing.fact = this._makeFact(id, data);
      this._emit({ type: 'asserted', factId: id, cause: 'promoted' });
      return existing.fact;
    }
    const node: FactNode = {
      fact: this._makeFact(id, data),
      premise: true,
      justifications: [],
      dependents: new Set(),
    };
    this._nodes.set(id, node);
    this._emit({ type: 'asserted', factId: id, cause: 'assert' });
    return node.fact;
  }

  /**
   * Asserts a *derived* fact supported by a rule firing over `supports`.
   *
   * If the fact already exists, the new justification is appended (facts can
   * have multiple independent derivations — the fact survives until all of
   * them are invalidated). New data is merged: object payloads are shallow
   * merged; primitives are overwritten.
   */
  assertDerived(id: string, data: unknown, ruleId: string, supports: readonly string[]): Fact {
    const justification: Justification = { ruleId, supports: [...supports] };
    const existing = this._nodes.get(id);
    if (existing) {
      if (existing.premise) {
        // Premise facts cannot be overridden by derivation — they are ground.
        // Still record the justification so retraction bookkeeping stays sane.
        existing.justifications.push(justification);
        this._linkSupports(id, justification);
        return existing.fact;
      }
      const duplicate = existing.justifications.some(
        (j) => j.ruleId === ruleId && arrayEq(j.supports, supports)
      );
      if (!duplicate) {
        existing.justifications.push(justification);
      }
      existing.fact = this._makeFact(id, mergePayload(existing.fact.data, data));
      this._linkSupports(id, justification);
      this._emit({ type: 'asserted', factId: id, cause: `derived:${ruleId}` });
      return existing.fact;
    }
    const node: FactNode = {
      fact: this._makeFact(id, data),
      premise: false,
      justifications: [justification],
      dependents: new Set(),
    };
    this._nodes.set(id, node);
    this._linkSupports(id, justification);
    this._emit({ type: 'asserted', factId: id, cause: `derived:${ruleId}` });
    return node.fact;
  }

  /**
   * Retracts a fact and — if it was supporting derived facts — cascades.
   * Returns the ids of every fact actually removed (including the target).
   */
  retract(id: string): string[] {
    const removed: string[] = [];
    this._retractInternal(id, removed, 'explicit');
    return removed;
  }

  /**
   * Removes one specific justification from a derived fact (used when a rule
   * result is undone). If it was the last support, the fact cascades away.
   */
  retractJustification(factId: string, ruleId: string): string[] {
    const node = this._nodes.get(factId);
    if (!node || node.premise) {
      return [];
    }
    node.justifications = node.justifications.filter((j) => j.ruleId !== ruleId);
    if (node.justifications.length === 0) {
      const removed: string[] = [];
      this._retractInternal(factId, removed, `unsupported:${ruleId}`);
      return removed;
    }
    return [];
  }

  get(id: string): Fact | undefined {
    return this._nodes.get(id)?.fact;
  }

  has(id: string): boolean {
    return this._nodes.has(id);
  }

  get size(): number {
    return this._nodes.size;
  }

  /** Facts in insertion order (Map preserves it — stable for conflict res.). */
  facts(): Fact[] {
    return Array.from(this._nodes.values(), (n) => n.fact);
  }

  /**
   * Facts matching a predicate, sorted by recency descending (most recent
   * first). Convenience for agenda construction.
   */
  query(predicate: (fact: Fact) => boolean): Fact[] {
    return this.facts()
      .filter(predicate)
      .sort((a, b) => b.recency - a.recency);
  }

  /**
   * Flattens all fact payloads into a single plain object for condition
   * evaluation. Fact ids become top-level keys. For a fact whose data is a
   * record, its entries are also spread at top level unless they collide with
   * another fact id — this makes conditions like `user.age` work when either
   * `user` is a fact id or a field inside a single `input` fact.
   */
  toFactObject(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const factIds = new Set(this._nodes.keys());
    for (const [id, node] of this._nodes) {
      out[id] = node.fact.data;
    }
    for (const node of this._nodes.values()) {
      const data = node.fact.data;
      if (data !== null && typeof data === 'object' && !Array.isArray(data) && !(data instanceof Date)) {
        for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
          if (!factIds.has(k) && !(k in out)) {
            out[k] = v;
          }
        }
      }
    }
    return out;
  }

  /** Justifications currently recorded for a fact (empty for premises). */
  justificationsOf(id: string): readonly Justification[] {
    return this._nodes.get(id)?.justifications ?? [];
  }

  clear(): void {
    this._nodes.clear();
  }

  private _makeFact(id: string, data: unknown): Fact {
    return { id, data, recency: ++this._recencyCounter, assertedAt: this._clock() };
  }

  private _linkSupports(factId: string, j: Justification): void {
    for (const supportId of j.supports) {
      this._nodes.get(supportId)?.dependents.add(factId);
    }
  }

  private _unlinkSupports(node: FactNode): void {
    for (const j of node.justifications) {
      for (const supportId of j.supports) {
        this._nodes.get(supportId)?.dependents.delete(node.fact.id);
      }
    }
  }

  /**
   * Depth-first cascade retraction. A derived dependent is only removed once
   * every justification referencing the removed fact is gone AND it has no
   * other surviving justifications.
   */
  private _retractInternal(id: string, removed: string[], cause: string): void {
    const node = this._nodes.get(id);
    if (!node) {
      return;
    }
    this._unlinkSupports(node);
    this._nodes.delete(id);
    removed.push(id);
    this._emit({ type: removed.length === 1 && cause === 'explicit' ? 'retracted' : 'cascade-retracted', factId: id, cause });

    // Snapshot dependents — the set mutates as we unlink children.
    const dependents = Array.from(node.dependents);
    node.dependents.clear();
    for (const depId of dependents) {
      const dep = this._nodes.get(depId);
      if (!dep || dep.premise) {
        continue;
      }
      // Drop justifications that relied on the removed fact.
      dep.justifications = dep.justifications.filter((j) => !j.supports.includes(id));
      if (dep.justifications.length === 0) {
        this._retractInternal(depId, removed, `lost-support:${id}`);
      }
    }
  }

  private _emit(event: WorkingMemoryEvent): void {
    for (const l of this._listeners) {
      l(event);
    }
  }
}

function arrayEq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

function mergePayload(existing: unknown, incoming: unknown): unknown {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
  if (isRecord(existing) && isRecord(incoming)) {
    return { ...existing, ...incoming };
  }
  return incoming;
}
