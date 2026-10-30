/**
 * Repository Engine — shared types.
 *
 * The engine module adds a *second*, self-contained query engine to the
 * repository layer. Unlike `components/query-parser` (which parses textual
 * query strings into `ParsedQuery` structures) and `components/pagination-engine`
 * (which slices arrays by page number), this engine works on a typed
 * `SpecNode` tree that compiles to BOTH an in-memory predicate and a
 * parameterized SQL-like string, plus keyset ("cursor") pagination,
 * optimistic-locking storage, and percentile query metrics.
 *
 * @module RepositoryLayer/Engine
 */

/** Comparison operators supported by the specification tree. */
export type CmpOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith';

/**
 * A node in the specification tree.
 *
 * The tree is a discriminated union over `kind` so the compiler can walk it
 * exhaustively (tsc verifies completeness via `never` checks).
 */
export type SpecNode =
  | { readonly kind: 'cmp'; readonly op: CmpOp; readonly field: string; readonly value: unknown }
  | { readonly kind: 'in'; readonly field: string; readonly values: readonly unknown[] }
  | {
      readonly kind: 'between';
      readonly field: string;
      readonly lo: unknown;
      readonly hi: unknown;
      readonly inclusive: boolean;
    }
  | { readonly kind: 'isNull'; readonly field: string }
  | { readonly kind: 'notNull'; readonly field: string }
  | { readonly kind: 'and'; readonly children: readonly SpecNode[] }
  | { readonly kind: 'or'; readonly children: readonly SpecNode[] }
  | { readonly kind: 'not'; readonly child: SpecNode }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' };

/** A single sort key: field path + direction. */
export interface SortKey {
  readonly field: string;
  readonly dir: 'asc' | 'desc';
}

/** Direction-agnostic page arguments (GraphQL-connection style). */
export interface PageArgs {
  /** Opaque cursor — return rows strictly after this position. */
  readonly after?: string;
  /** Opaque cursor — return rows strictly before this position. */
  readonly before?: string;
  /** Max rows for forward pagination. */
  readonly first?: number;
  /** Max rows for backward pagination. */
  readonly last?: number;
}

/** Cursor metadata for a page (Relay-style). */
export interface PageInfo {
  readonly startCursor: string | null;
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/** A page of rows plus edge cursors. */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly edges: readonly { readonly node: T; readonly cursor: string }[];
  readonly pageInfo: PageInfo;
  /** Rows remaining on the store side of the filter (before windowing). */
  readonly totalMatching: number;
}

/** Result of compiling a `SpecNode`. */
export interface CompiledSpec<T> {
  /** In-memory predicate; O(tree nodes) per row. */
  readonly predicate: (row: T) => boolean;
  /** SQL-like WHERE clause with `$n` placeholders (never interpolated). */
  readonly sql: string;
  /** Bound parameter values in `$n` order. */
  readonly params: readonly unknown[];
  /** Fields referenced by the spec (for index selection). */
  readonly fields: readonly string[];
}

/** Thrown when an optimistic-lock version check fails. */
export class OptimisticLockError extends Error {
  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Optimistic lock conflict on "${entityId}": expected version ${expectedVersion}, found ${actualVersion}`
    );
    this.name = 'OptimisticLockError';
  }
}

/** Thrown when a cursor cannot be decoded or is inconsistent with the sort. */
export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}

/** Thrown when a spec is structurally invalid (e.g. empty `and`). */
export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecError';
  }
}
