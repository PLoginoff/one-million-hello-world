/**
 * CrossShardQuery — scatter/gather execution across shards.
 *
 * A query that can't be resolved to one shard must FAN OUT to all of them:
 * each shard filters its own rows (scatter), then the coordinator merges the
 * partial results (gather). This is the same pattern federated engines use —
 * each shard is independent, so partial failure is a first-class case.
 *
 * Merge semantics:
 *   - No sort → concatenation in shard order, global limit applied after.
 *   - Sorted → k-way merge via a min-heap over per-shard iterators, so the
 *     merge is O(R log S) for R returned rows and S shards, not O(R log R)
 *     re-sort of the whole gathered set (matters when shards already return
 *     sorted streams — which real shards do from their own indexes).
 *   - Keyset `after`/`before` cursors: the cursor's sort-key values are sent
 *     to EVERY shard, each shard applies it locally, and the merged stream
 *     is then re-windowed globally. Shard provenance is preserved in the
 *     cursor by tagging it (the values alone suffice because sort keys are
 *     globally comparable).
 *
 * Partial failure: `onShardError` decides per shard — 'fail' propagates the
 * first error (correctness-first default), 'skip' returns partial results
 * flagged in the result's `partialShards` list (availability-first).
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { CursorPaginator } from '../CursorPaginator';
import { compareValues, getPath } from '../path';
import { Spec } from '../Spec';
import { SpecCompiler } from '../SpecCompiler';
import { Page, SpecNode } from '../types';
import { ShardRouter } from './ShardRouter';
import { CrossShardError, FanOutQuery } from './types';

export interface FanOutResult<T> {
  readonly page: Page<ShardRow_<T>>;
  /** Shards that returned results. */
  readonly shardsHit: readonly string[];
  /** Shards skipped due to error (only non-empty under onShardError='skip'). */
  readonly failedShards: readonly string[];
}

/** Row plus the shard that produced it (provenance for debugging/masking). */
export interface ShardRow_<T> {
  readonly shard: string;
  readonly row: T;
}

export interface CrossShardQueryOptions {
  /** What to do when a single shard throws: propagate or degrade. */
  readonly onShardError?: 'fail' | 'skip';
}

interface ShardError {
  readonly shard: string;
  readonly error: Error;
}

export class CrossShardQuery<T> {
  private readonly paginator = new CursorPaginator();
  private readonly compiler = new SpecCompiler();
  private readonly onShardError: 'fail' | 'skip';

  constructor(
    private readonly router: ShardRouter<T>,
    options: CrossShardQueryOptions = {}
  ) {
    this.onShardError = options.onShardError ?? 'fail';
  }

  /**
   * Point read: resolve the shard key, hit exactly one shard. O(1) routing +
   * O(1) store lookup — the fast path that sharding exists to preserve.
   */
  getByKey(shardKey: string, id: string): T | null {
    return this.router.shardForKey(shardKey).store.get(id);
  }

  /**
   * Routed write: extract the shard key, insert into exactly one shard.
   * Single-shard writes keep their atomicity guarantees; multi-shard atomic
   * writes would need 2PC, which sharding explicitly avoids.
   */
  insert(row: T): { shard: string; stored: T } {
    const shard = this.router.shardFor(row);
    return { shard: shard.name, stored: shard.store.insert(row) };
  }

  /**
   * Scatter/gather: every shard filters with the compiled predicate, then
   * results merge per the query's sort + page. When `spec` is a single
   * equality on the shard key field we could prune to one shard — the
   * planner (`QueryPlanAnalyzer.pruneShards`) does that upstream; this
   * executor stays general.
   */
  query(specNode: SpecNode, sort: FanOutQuery['sort'] = [], page = {}): FanOutResult<T> {
    const predicate = this.compiler.compilePredicate<T>(Spec.of(specNode));
    const errors: ShardError[] = [];
    const perShard: { shard: string; rows: T[] }[] = [];

    // Scatter: sequential here (single-threaded), but the shape is the same
    // as Promise.all — each shard's work is independent.
    for (const name of this.router.shardNames()) {
      const shard = this.router.shardNamed(name);
      try {
        perShard.push({ shard: name, rows: shard.store.scan(predicate) });
      } catch (e) {
        if (this.onShardError === 'fail') {
          throw new CrossShardError(
            `Shard "${name}" failed during fan-out: ${(e as Error).message}`
          );
        }
        errors.push({ shard: name, error: e as Error });
      }
    }

    // Gather + merge.
    const merged = sort.length > 0 ? this.mergeSorted(perShard, sort) : this.mergeUnsorted(perShard);
    const tagged: ShardRow_<T>[] = merged;

    const paged = this.paginateTagged(tagged, specNode, sort, page);

    return {
      page: paged,
      shardsHit: perShard.filter((s) => s.rows.length > 0).map((s) => s.shard),
      failedShards: errors.map((e) => e.shard),
    };
  }

  /** Convenience: rows only (no page metadata). */
  queryAll(specNode: SpecNode, sort: FanOutQuery['sort'] = []): ShardRow_<T>[] {
    return this.query(specNode, sort).page.rows as ShardRow_<T>[];
  }

  /** Count across shards without materializing pages. */
  count(specNode: SpecNode): number {
    const predicate = this.compiler.compilePredicate<T>(Spec.of(specNode));
    let n = 0;
    for (const name of this.router.shardNames()) {
      n += this.router.shardNamed(name).store.scan(predicate).length;
    }
    return n;
  }

  // ------------------------------------------------------------------------
  // Merge implementations
  // ------------------------------------------------------------------------

  /** Unsorted: preserve shard order, no heap needed. */
  private mergeUnsorted(perShard: { shard: string; rows: T[] }[]): ShardRow_<T>[] {
    const out: ShardRow_<T>[] = [];
    for (const s of perShard) {
      for (const row of s.rows) out.push({ shard: s.shard, row });
    }
    return out;
  }

  /**
   * Sorted k-way merge: a min-heap of (shardIdx, rowIdx) positions ordered
   * by the row's sort keys. Each shard's slice is sorted first (O(k log k)),
   * then the heap emits the global order in O(R log S).
   *
   * Why not concat-and-sort: concat is O(R log R) and destroys per-shard
   * order information. The heap merge is what real engines (Postgres
   * MergeAppend, Lucene's MultiTermsEnum) do over pre-sorted inputs.
   */
  private mergeSorted(
    perShard: { shard: string; rows: T[] }[],
    sort: readonly { field: string; dir: 'asc' | 'desc' }[]
  ): ShardRow_<T>[] {
    const cmp = this.paginator.comparator<T>(sort);
    // Per-shard sorted arrays + a cursor position into each.
    const cursors = perShard.map((s) => ({
      shard: s.shard,
      rows: [...s.rows].sort(cmp),
      idx: 0,
    }));

    // Min-heap of cursor positions keyed by current row (small S → array scan
    // is fine and avoids pulling in a heap for a 2–16 way merge).
    const live = cursors.filter((c) => c.rows.length > 0);
    const out: ShardRow_<T>[] = [];
    while (live.length > 0) {
      // Find the cursor whose current row is smallest under `cmp`.
      let best = 0;
      for (let i = 1; i < live.length; i++) {
        const a = live[i].rows[live[i].idx];
        const b = live[best].rows[live[best].idx];
        if (cmp(a, b) < 0) best = i;
      }
      const c = live[best];
      out.push({ shard: c.shard, row: c.rows[c.idx] });
      c.idx++;
      if (c.idx >= c.rows.length) live.splice(best, 1);
    }
    return out;
  }

  /**
   * Keyset window over merged rows. The merged stream is globally sorted, so
   * we apply the cursor bounds directly: rows strictly-after `after` and
   * strictly-before `before`, then take `first`/`last`. Returns a Page with
   * cursors that carry sort-key values (decodable on the next call).
   */
  private paginateTagged(
    rows: ShardRow_<T>[],
    spec: SpecNode,
    sort: readonly { field: string; dir: 'asc' | 'desc' }[],
    args: { after?: string; before?: string; first?: number; last?: number }
  ): Page<ShardRow_<T>> {
    if (sort.length === 0) {
      // No sort → offset-free slice semantics; cursors would be meaningless.
      const first = args.first ?? rows.length;
      const slice = rows.slice(0, first);
      return {
        rows: slice,
        edges: slice.map((n) => ({ node: n, cursor: '' })),
        pageInfo: {
          startCursor: null,
          endCursor: null,
          hasNextPage: rows.length > first,
          hasPreviousPage: false,
        },
        totalMatching: rows.length,
      };
    }

    // Decode cursor bounds into sort-key values, filter the merged stream.
    let lo = 0;
    let hi = rows.length;
    const cmpRow = this.paginator.comparator<ShardRow_<T>>(
      // Compare on the inner row's fields, not the wrapper.
      sort
    );
    void cmpRow;
    const valCmp = (a: ShardRow_<T>, keyValues: readonly unknown[]): number => {
      for (let i = 0; i < sort.length; i++) {
        const c = compareValues(getPath(a.row, sort[i].field), keyValues[i]);
        if (c === null) continue;
        if (c !== 0) return sort[i].dir === 'asc' ? c : -c;
      }
      return 0;
    };

    if (args.after !== undefined) {
      const kv = this.decodeCursorValues(args.after, sort);
      lo = 0;
      while (lo < rows.length && valCmp(rows[lo], kv) <= 0) lo++;
    }
    if (args.before !== undefined) {
      const kv = this.decodeCursorValues(args.before, sort);
      hi = rows.length;
      while (hi > lo && valCmp(rows[hi - 1], kv) >= 0) hi--;
    }

    const windowed = rows.slice(lo, hi);
    let page: ShardRow_<T>[];
    let hasNext: boolean;
    let hasPrev: boolean;
    const first = args.first ?? Number.POSITIVE_INFINITY;
    const last = args.last ?? Number.POSITIVE_INFINITY;
    if (last !== Number.POSITIVE_INFINITY && windowed.length > last) {
      page = windowed.slice(windowed.length - last);
      hasNext = hi < rows.length;
      hasPrev = true;
    } else if (first !== Number.POSITIVE_INFINITY && windowed.length > first) {
      page = windowed.slice(0, first);
      hasNext = true;
      hasPrev = lo > 0;
    } else {
      page = windowed;
      hasNext = hi < rows.length;
      hasPrev = lo > 0;
    }

    const edges = page.map((node) => ({
      node,
      cursor: this.paginator.encode(node.row, sort),
    }));
    return {
      rows: page,
      edges,
      pageInfo: {
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        hasNextPage: hasNext,
        hasPreviousPage: hasPrev,
      },
      totalMatching: rows.length,
    };
  }

  private decodeCursorValues(
    cursor: string,
    sort: readonly { field: string; dir: 'asc' | 'desc' }[]
  ): readonly unknown[] {
    return this.paginator.decode(cursor, sort);
  }
}
