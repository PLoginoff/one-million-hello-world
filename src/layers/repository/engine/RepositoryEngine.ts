/**
 * Repository Engine
 *
 * Facade composing the engine pieces into the repository-facing API:
 *
 *   Spec → SpecCompiler → predicate (+SQL string) → index-assisted scan on
 *   VersionedStore → CursorPaginator → timed by QueryMetrics.
 *
 * This is the layer's SECOND query path: the existing `Repository` +
 * `QueryBuilder`/`InMemoryAdapter` stack exposes filter/sort/page options;
 * this engine exposes spec trees, opaque cursors, version-checked writes,
 * soft deletes, and latency percentiles.
 *
 * @module RepositoryLayer/Engine
 */

import { CursorPaginator } from './CursorPaginator';
import { QueryMetrics } from './QueryMetrics';
import { Spec } from './Spec';
import { SpecCompiler } from './SpecCompiler';
import { Page, PageArgs, SortKey } from './types';
import { StoredEntity, StoreOptions, VersionedStore } from './VersionedStore';

export interface EngineQuery {
  readonly spec?: Spec;
  readonly sort?: readonly SortKey[];
  readonly page?: PageArgs;
  /** See tombstoned rows (default false → global soft-delete filter). */
  readonly includeDeleted?: boolean;
  /** Metric label override (default: 'query'). */
  readonly label?: string;
}

export class RepositoryEngine<T extends StoredEntity> {
  readonly store: VersionedStore<T>;
  readonly metrics: QueryMetrics;
  readonly compiler = new SpecCompiler();
  readonly paginator = new CursorPaginator();
  private readonly clock: () => number;

  constructor(options: StoreOptions & { metricsReservoir?: number } = {}) {
    this.clock = options.clock ?? Date.now;
    this.store = new VersionedStore<T>(options);
    this.metrics = new QueryMetrics({ reservoirSize: options.metricsReservoir });
  }

  /**
   * Executes a query end-to-end and returns a cursor page.
   *
   * Index selection: a single `field = value` spec on an indexed field
   * resolves candidate ids in O(1); anything else full-scans. Same
   * planner rule real engines use (point lookup → index, else seq scan).
   */
  query(q: EngineQuery = {}): Page<T> {
    const label = q.label ?? 'query';
    return this.metrics.measure(label, () => this.runQuery(q), this.clock);
  }

  /** SQL projection of the same spec (what a SQL adapter would execute). */
  explain(spec: Spec): { sql: string; params: readonly unknown[] } {
    const c = this.compiler.compile(spec);
    return { sql: c.sql, params: c.params };
  }

  /** Convenience: all live rows matching a spec, no pagination. */
  findAll(spec?: Spec): T[] {
    return this.query({ spec, sort: [{ field: 'id', dir: 'asc' }], label: 'findAll' }).rows.slice();
  }

  count(spec?: Spec): number {
    const predicate = spec ? this.compiler.compilePredicate<T>(spec) : () => true;
    return this.store.scan(predicate).length;
  }

  // ------------------------------------------------------------------------

  private runQuery(q: EngineQuery): Page<T> {
    const includeDeleted = q.includeDeleted ?? false;
    const spec = q.spec ?? Spec.all();
    const compiled = this.compiler.compile<T>(spec);

    // Cost-based candidate selection.
    let candidates: T[];
    const idx = this.store.indexLookup(spec.node);
    if (idx !== null && !includeDeleted) {
      candidates = this.store.rowsByIds(idx, false);
      // Index is on raw equality; predicate still applied for correctness
      // on soft-deleted rows that already filtered via rowsByIds.
      candidates = candidates.filter(compiled.predicate);
    } else {
      candidates = this.store.scan(compiled.predicate, includeDeleted);
    }

    const sort = q.sort ?? [{ field: 'id', dir: 'asc' as const }];
    return this.paginator.paginate(candidates, () => true, sort, q.page ?? {});
  }
}
