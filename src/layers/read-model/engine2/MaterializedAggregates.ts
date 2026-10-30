/**
 * MaterializedAggregates — pre-computed rollups maintained on write.
 *
 * Queries like "order count per status" or "revenue per day" shouldn't
 * scan the projection at read time. Aggregates are updated on write via
 * delta application: each row insert/update/delete applies a delta to
 * the maintained rollup — counts, sums, min/max — so reads are O(1).
 *
 * Each group keeps a member map (row key -> numeric contribution) so
 * updates and deletes remove exactly the old contribution — including
 * cross-group moves when the group-by field changes. Group values are
 * recomputed from members on write (O(group size) write, O(1) read);
 * empty groups are dropped so `groups()` only reports live groups.
 * Group-by and aggregate fields use dot-notation payload paths.
 *
 * @module ReadModelLayer/Engine2
 */

import { ProjectionRow } from './types';

type AggKind = 'count' | 'sum' | 'min' | 'max';

export interface AggregateSpec {
  /** Aggregate name (e.g. "orders_by_status"). */
  readonly name: string;
  /** Projection it rolls up. */
  readonly projection: string;
  /** Payload field path (dot notation) used as group key. */
  readonly groupBy: string;
  /** Aggregation kind. */
  readonly kind: AggKind;
  /** Payload field path to aggregate (required for sum/min/max). */
  readonly field?: string;
}

interface GroupState {
  /** member row key -> numeric contribution (1 per row for count). */
  members: Map<string, number>;
  value: number;
}

interface AggregateState {
  spec: AggregateSpec;
  groups: Map<string, GroupState>;
}

function getPath(payload: Record<string, unknown>, path: string): unknown {
  let cur: unknown = payload;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function neutral(kind: AggKind): number {
  if (kind === 'count' || kind === 'sum') return 0;
  return kind === 'min' ? Infinity : -Infinity;
}

/** Recompute a group's value from its member map — O(group size). */
function recomputeGroup(g: GroupState, kind: AggKind): void {
  if (kind === 'count') {
    g.value = g.members.size;
    return;
  }
  if (g.members.size === 0) {
    g.value = neutral(kind);
    return;
  }
  let v = kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0;
  for (const mv of g.members.values()) {
    if (kind === 'min') v = Math.min(v, mv);
    else if (kind === 'max') v = Math.max(v, mv);
    else v += mv;
  }
  g.value = v;
}

interface GroupState {
  /** member row key -> numeric contribution (1 per row for count). */
  members: Map<string, number>;
  value: number;
}

interface AggregateState {
  spec: AggregateSpec;
  groups: Map<string, GroupState>;
}

export class MaterializedAggregates {
  private readonly _aggs = new Map<string, AggregateState>();
  private readonly _byProjection = new Map<string, AggregateState[]>();

  /** Register an aggregate. Existing rows are NOT backfilled — call
   *  `rebuild` after registering over pre-loaded data. */
  register(spec: AggregateSpec): void {
    if (spec.kind !== 'count' && !spec.field) {
      throw new Error(`${spec.kind} aggregate '${spec.name}' requires field`);
    }
    const st: AggregateState = { spec, groups: new Map() };
    this._aggs.set(spec.name, st);
    const list = this._byProjection.get(spec.projection) ?? [];
    list.push(st);
    this._byProjection.set(spec.projection, list);
  }

  /** Apply one row's contribution with sign +1 (add) or -1 (remove). */
  private _applyDelta(st: AggregateState, row: ProjectionRow, sign: 1 | -1): void {
    const spec = st.spec;
    if (row.projection !== spec.projection) return;
    const gk = String(getPath(row.payload, spec.groupBy) ?? '<null>');
    let g = st.groups.get(gk);
    if (!g) {
      g = { members: new Map(), value: neutral(spec.kind) };
      st.groups.set(gk, g);
    }
    const fv = spec.kind === 'count' ? 1 : Number(getPath(row.payload, spec.field!) ?? 0);
    if (sign === 1) {
      g.members.set(row.key, spec.kind === 'count' ? 1 : fv);
    } else {
      g.members.delete(row.key);
    }
    if (g.members.size === 0) {
      st.groups.delete(gk);
      return;
    }
    recomputeGroup(g, spec.kind);
  }

  /** Row written (insert or update). Pass oldRow for updates so the old
   *  contribution is removed — possibly from a different group. */
  onWrite(row: ProjectionRow, oldRow?: ProjectionRow): void {
    for (const st of this._byProjection.get(row.projection) ?? []) {
      if (oldRow) this._applyDelta(st, oldRow, -1);
      this._applyDelta(st, row, 1);
    }
  }

  onDelete(row: ProjectionRow): void {
    for (const st of this._byProjection.get(row.projection) ?? []) {
      this._applyDelta(st, row, -1);
    }
  }

  /** Rebuild all aggregates from a row scan (initial backfill). */
  rebuild(rows: Iterable<ProjectionRow>): void {
    for (const st of this._aggs.values()) st.groups.clear();
    for (const row of rows) {
      for (const st of this._byProjection.get(row.projection) ?? []) {
        this._applyDelta(st, row, 1);
      }
    }
  }

  /** Rollup value for a group key; missing group -> neutral value. */
  value(aggregate: string, groupKey: string): number {
    const st = this._aggs.get(aggregate);
    if (!st) throw new Error(`unknown aggregate '${aggregate}'`);
    const g = st.groups.get(groupKey);
    return g ? g.value : neutral(st.spec.kind);
  }

  /** All group values for an aggregate. */
  groups(aggregate: string): Map<string, number> {
    const st = this._aggs.get(aggregate);
    if (!st) throw new Error(`unknown aggregate '${aggregate}'`);
    const out = new Map<string, number>();
    for (const [gk, g] of st.groups) out.set(gk, g.value);
    return out;
  }
}
