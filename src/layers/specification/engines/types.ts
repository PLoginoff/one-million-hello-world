/**
 * Specification Engine — Core Types
 *
 * Shared vocabulary for the specification-pattern engines:
 *   - `ISpecification<T>`       — the composite interface every spec implements
 *   - `SpecNode`                — a serializable criteria tree (reused by the
 *                                 SQL renderer, description renderer, and
 *                                 JSON persistence)
 *   - `SpecEvaluation`          — a satisfied/not-satisfied verdict carrying
 *                                 the spec's explainability payload
 *   - `CandidateScore`          — result of best-match selection
 *
 * Like the query-object engine, the criteria tree is plain data: one
 * tree, three interpreters (predicate eval, SQL fragment, English
 * description), plus JSON persistence.
 *
 * @module Specification/Engines
 */

// ---------------------------------------------------------------------------
// The specification contract
// ---------------------------------------------------------------------------

/**
 * A business rule that can be:
 *   - evaluated against a candidate object (`isSatisfiedBy`),
 *   - combined into larger rules (`and` / `or` / `not`),
 *   - translated to a SQL `WHERE` fragment (`toSql`),
 *   - rendered as a human-readable description (`describe`),
 *   - serialized to JSON for persistence / transport (`toNode`).
 */
export interface ISpecification<T = Record<string, unknown>> {
  /** Human-readable name, e.g. `'AdultUser'`. */
  readonly name: string;
  /** Evaluate the rule against a candidate. */
  isSatisfiedBy(candidate: T): boolean;
  /** `this AND other` — both must hold. */
  and(other: ISpecification<T>): ISpecification<T>;
  /** `this OR other` — at least one must hold. */
  or(other: ISpecification<T>): ISpecification<T>;
  /** `NOT this`. */
  not(): ISpecification<T>;
  /**
   * SQL WHERE fragment plus ordered bind parameters. The fragment does
   * NOT include the `WHERE` keyword so fragments compose under
   * AND/OR/NOT with parens.
   */
  toSql(): SpecSql;
  /** English description of the rule, e.g. `"age >= 18 and status = 'vip'"`. */
  describe(): string;
  /**
   * Serialize to the plain-data SpecNode tree. Round-trips through
   * `specFromNode` for all built-in spec kinds.
   */
  toNode(): SpecNode;
}

/** Parameterized SQL fragment. */
export interface SpecSql {
  sql: string;
  params: unknown[];
}

// ---------------------------------------------------------------------------
// SpecNode — the serializable tree
// ---------------------------------------------------------------------------

/** Comparison operators mirroring the query-object vocabulary. */
export enum SpecOp {
  Eq = 'eq',
  Ne = 'ne',
  Gt = 'gt',
  Gte = 'gte',
  Lt = 'lt',
  Lte = 'lte',
  In = 'in',
  NotIn = 'notIn',
  Contains = 'contains',
  StartsWith = 'startsWith',
  EndsWith = 'endsWith',
  Matches = 'matches',
  Between = 'between',
  IsNull = 'isNull',
  IsNotNull = 'isNotNull',
}

/** Leaf: `field OP value` (`value2` is the upper bound for Between). */
export interface SpecLeaf {
  kind: 'leaf';
  field: string;
  op: SpecOp;
  value?: unknown;
  value2?: unknown;
}

/** Composite AND/OR over child specs. */
export interface SpecLogic {
  kind: 'logic';
  op: 'and' | 'or';
  children: SpecNode[];
}

/** Negation wrapper. */
export interface SpecNot {
  kind: 'not';
  child: SpecNode;
}

/**
 * A named custom specification opaque to the built-in translators —
 * serialized with its parameters so it can be rehydrated through a
 * `SpecRegistry` that maps `spec` names to factory functions.
 */
export interface SpecCustom {
  kind: 'custom';
  spec: string;
  params: Record<string, unknown>;
}

export type SpecNode = SpecLeaf | SpecLogic | SpecNot | SpecCustom;

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * A scored candidate from best-match selection. `score` is the
 * fraction of *satisfied conjunctive leaves* (0..1): a candidate that
 * satisfies every leaf of an AND-tree scores 1.0 even if the whole
 * spec fails — useful for "closest match" semantics.
 */
export interface CandidateScore<T> {
  candidate: T;
  score: number;
  /** Per-leaf satisfaction details for explainability. */
  detail: LeafVerdict[];
}

export interface LeafVerdict {
  spec: string;
  satisfied: boolean;
}

// ---------------------------------------------------------------------------
// Registry for deserialization
// ---------------------------------------------------------------------------

/**
 * Factory mapping a custom spec name + params to a live specification.
 * Built-in leaf/logic/not nodes reconstruct without a registry.
 */
export type SpecFactory<T = Record<string, unknown>> = (
  params: Record<string, unknown>
) => ISpecification<T>;

/** Type guard helpers. */
export function isLeafNode(n: SpecNode): n is SpecLeaf {
  return n.kind === 'leaf';
}
export function isLogicNode(n: SpecNode): n is SpecLogic {
  return n.kind === 'logic';
}
export function isNotNode(n: SpecNode): n is SpecNot {
  return n.kind === 'not';
}
export function isCustomNode(n: SpecNode): n is SpecCustom {
  return n.kind === 'custom';
}
