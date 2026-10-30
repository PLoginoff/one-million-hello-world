/**
 * Assembly — denormalization helpers for composed read models.
 *
 * Read models are flat for query speed, but responses often need the
 * composed shape: an order WITH its lines, a customer WITH its orders.
 * These helpers assemble parent-child documents at query time.
 *
 * Strategies provided:
 *   - `joinChildren`: fetch children via an indexed foreign key
 *     (O(1) per parent via findBy).
 *   - `embedChildren`: keep children embedded under a field of the parent
 *     doc (write-time denormalization) — helpers to add/update/remove a
 *     child while keeping a `childCount` aggregate field consistent.
 *   - `groupChildren`: fold a flat list of parent+child rows into nested
 *     documents (SQL-join-result style → tree).
 *
 * Nothing here talks to the event log — these are pure read-side helpers.
 *
 * @module CqrsLayer/Engine
 */

import { ReadModelStore, ReadModelDocument } from './ReadModelStore';

export interface JoinSpec {
  /** Child model name. */
  readonly model: string;
  /** Field on the CHILD doc holding the parent id. */
  readonly foreignKey: string;
  /** Field name under which children land on the parent result. */
  readonly as: string;
  /** Optional child sort (applied after fetch). */
  readonly sortBy?: (a: ReadModelDocument, b: ReadModelDocument) => number;
}

/**
 * Attach children to a parent document via indexed foreign keys.
 *
 *   joinChildren(store, order, [
 *     { model: 'order-lines', foreignKey: 'orderId', as: 'lines' },
 *     { model: 'shipments', foreignKey: 'orderId', as: 'shipments' },
 *   ], 'id')
 *
 * The parent id is read from `parentIdField` on the parent doc.
 * Returns a NEW document — the stored parent is not mutated.
 */
export function joinChildren(
  store: ReadModelStore,
  parent: ReadModelDocument,
  joins: readonly JoinSpec[],
  parentIdField = 'id'
): ReadModelDocument {
  const out: ReadModelDocument = { ...parent };
  const parentId = parent[parentIdField];
  for (const j of joins) {
    let children = store.findBy(j.model, j.foreignKey, parentId);
    if (j.sortBy) children = [...children].sort(j.sortBy);
    out[j.as] = children;
  }
  return out;
}

/** Same, applied to a list of parents. O(parents) index lookups. */
export function joinChildrenMany(
  store: ReadModelStore,
  parents: readonly ReadModelDocument[],
  joins: readonly JoinSpec[],
  parentIdField = 'id'
): ReadModelDocument[] {
  return parents.map((p) => joinChildren(store, p, joins, parentIdField));
}

// ---------------------------------------------------------------------
// Embedded children (write-time denormalization)
// ---------------------------------------------------------------------

export interface EmbedSpec {
  /** Field holding the child array (e.g. 'lines'). */
  readonly as: string;
  /** Child id field (default 'id'). */
  readonly childIdField?: string;
  /** Aggregate counter field to keep in sync (e.g. 'lineCount'); optional. */
  readonly countField?: string;
}

function childArray(parent: ReadModelDocument, spec: EmbedSpec): ReadModelDocument[] {
  const arr = parent[spec.as];
  return Array.isArray(arr) ? (arr as ReadModelDocument[]) : [];
}

function withChildren(
  parent: ReadModelDocument,
  spec: EmbedSpec,
  children: ReadModelDocument[]
): ReadModelDocument {
  const out: ReadModelDocument = { ...parent, [spec.as]: children };
  if (spec.countField) out[spec.countField] = children.length;
  return out;
}

/** Add or replace a child inside the parent's embedded array. */
export function embedChild(
  parent: ReadModelDocument,
  spec: EmbedSpec,
  child: ReadModelDocument
): ReadModelDocument {
  const idField = spec.childIdField ?? 'id';
  const children = childArray(parent, spec);
  const idx = children.findIndex((c) => c[idField] === child[idField]);
  if (idx === -1) children.push(child);
  else children[idx] = child;
  return withChildren(parent, spec, children);
}

/** Remove a child by id. */
export function removeEmbeddedChild(
  parent: ReadModelDocument,
  spec: EmbedSpec,
  childId: unknown
): ReadModelDocument {
  const idField = spec.childIdField ?? 'id';
  const children = childArray(parent, spec).filter((c) => c[idField] !== childId);
  return withChildren(parent, spec, children);
}

/** Patch a child in place (merge `patch` into the matching child). */
export function patchEmbeddedChild(
  parent: ReadModelDocument,
  spec: EmbedSpec,
  childId: unknown,
  patch: ReadModelDocument
): ReadModelDocument {
  const idField = spec.childIdField ?? 'id';
  const children = childArray(parent, spec).map((c) =>
    c[idField] === childId ? { ...c, ...patch } : c
  );
  return withChildren(parent, spec, children);
}

// ---------------------------------------------------------------------
// groupChildren — flat join rows → nested docs
// ---------------------------------------------------------------------

/**
 * Fold flat rows `{ parent: {...}, child: {...} | null }` into one document
 * per parent with children nested under `as`. A null child row means a
 * LEFT JOIN with no children (kept as an empty array).
 *
 * Complexity: O(rows). Parents keyed by `parentKeyField`.
 */
export function groupChildren(
  rows: readonly { parent: ReadModelDocument; child: ReadModelDocument | null }[],
  as: string,
  parentKeyField = 'id'
): ReadModelDocument[] {
  const byParent = new Map<unknown, ReadModelDocument>();
  const order: unknown[] = [];
  for (const row of rows) {
    const key = row.parent[parentKeyField];
    let acc = byParent.get(key);
    if (!acc) {
      acc = { ...row.parent, [as]: [] };
      byParent.set(key, acc);
      order.push(key);
    }
    if (row.child) {
      (acc[as] as ReadModelDocument[]).push(row.child);
    }
  }
  return order.map((k) => byParent.get(k)!);
}
