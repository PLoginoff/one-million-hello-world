/**
 * Specification — the abstract base class and combinators.
 *
 * Every spec extends `Specification<T>` and implements exactly three
 * primitives: `isSatisfiedBy`, `toNode`, and `describe`. Everything
 * else — `and`/`or`/`not` composition and the derived `toSql`
 * translator — is provided here so composite specs compose SQL and
 * descriptions for free.
 *
 * Design: SQL fragments and descriptions are derived *from the SpecNode
 * tree*, not from per-class overrides. That makes translation uniform —
 * a custom spec that serializes correctly translates correctly.
 *
 * @module Specification/Engines
 */

import { leafSql, leafDescription } from './renderers';
import {
  ISpecification,
  SpecLeaf,
  SpecLogic,
  SpecNode,
  SpecOp,
  SpecSql,
} from './types';

type Row = Record<string, unknown>;

/**
 * Base class for all specifications. Subclasses declare their criteria
 * through `buildNode()` (returning the serializable tree) and implement
 * `isSatisfiedBy` for in-memory evaluation.
 */
export abstract class Specification<T = Row> implements ISpecification<T> {
  abstract readonly name: string;

  abstract isSatisfiedBy(candidate: T): boolean;

  /** The serializable tree describing this spec's criteria. */
  abstract toNode(): SpecNode;

  /** `this AND other`. */
  and(other: ISpecification<T>): ISpecification<T> {
    return new AndSpec<T>(this, other);
  }

  /** `this OR other`. */
  or(other: ISpecification<T>): ISpecification<T> {
    return new OrSpec<T>(this, other);
  }

  /** `NOT this`. */
  not(): ISpecification<T> {
    return new NotSpec<T>(this);
  }

  /**
   * Translate the criteria tree to a parameterized WHERE fragment.
   * Parameters are threaded through in tree-walk order so binds line
   * up with placeholders.
   */
  toSql(): SpecSql {
    return nodeSql(this.toNode());
  }

  /** English rendering of the criteria tree. */
  describe(): string {
    return nodeDescription(this.toNode());
  }

  /**
   * Evaluate the *tree* rather than a subclass predicate — used by
   * composite specs that have no domain logic of their own.
   */
  protected _evalNode(candidate: T): boolean {
    return evalNode(this.toNode(), candidate);
  }
}

// ---------------------------------------------------------------------------
// Tree evaluation (shared by composites and the built-in leaf specs)
// ---------------------------------------------------------------------------

/** Resolve a dotted field path against a candidate. */
export function resolveField(candidate: unknown, path: string): unknown {
  let cur: unknown = candidate;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(seg);
      cur = Number.isInteger(i) ? cur[i] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Row)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function cmp(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return false;
}

/** Evaluate a leaf comparison against a candidate. */
export function evalLeaf(node: SpecLeaf, candidate: unknown): boolean {
  const v = resolveField(candidate, node.field);
  switch (node.op) {
    case SpecOp.Eq: return eq(v, node.value);
    case SpecOp.Ne: return !eq(v, node.value);
    case SpecOp.Gt: return v !== null && v !== undefined && cmp(v, node.value) > 0;
    case SpecOp.Gte: return v !== null && v !== undefined && cmp(v, node.value) >= 0;
    case SpecOp.Lt: return v !== null && v !== undefined && cmp(v, node.value) < 0;
    case SpecOp.Lte: return v !== null && v !== undefined && cmp(v, node.value) <= 0;
    case SpecOp.In: return Array.isArray(node.value) && (node.value as unknown[]).some((x) => eq(x, v));
    case SpecOp.NotIn:
      return !(Array.isArray(node.value) && (node.value as unknown[]).some((x) => eq(x, v)));
    case SpecOp.Between:
      return (
        v !== null &&
        v !== undefined &&
        cmp(v, node.value) >= 0 &&
        cmp(v, node.value2) <= 0
      );
    case SpecOp.IsNull: return v === null || v === undefined;
    case SpecOp.IsNotNull: return v !== null && v !== undefined;
    case SpecOp.Contains:
      if (typeof v === 'string' && typeof node.value === 'string') return v.includes(node.value);
      if (Array.isArray(v)) return v.some((x) => eq(x, node.value));
      return false;
    case SpecOp.StartsWith:
      return typeof v === 'string' && typeof node.value === 'string' && v.startsWith(node.value);
    case SpecOp.EndsWith:
      return typeof v === 'string' && typeof node.value === 'string' && v.endsWith(node.value);
    case SpecOp.Matches: {
      if (typeof v !== 'string') return false;
      const re =
        node.value instanceof RegExp
          ? node.value
          : typeof node.value === 'object' && node.value !== null && 'source' in node.value
            ? new RegExp(
                String((node.value as { source: unknown }).source),
                String((node.value as { flags?: unknown }).flags ?? '')
              )
            : new RegExp(String(node.value));
      re.lastIndex = 0;
      return re.test(v);
    }
  }
}

/** Evaluate an arbitrary tree — composite specs delegate here. */
export function evalNode(node: SpecNode, candidate: unknown): boolean {
  switch (node.kind) {
    case 'leaf': return evalLeaf(node, candidate);
    case 'logic':
      return node.op === 'and'
        ? node.children.every((c) => evalNode(c, candidate))
        : node.children.some((c) => evalNode(c, candidate));
    case 'not': return !evalNode(node.child, candidate);
    case 'custom':
      // Custom nodes are opaque to the evaluator — a live spec object
      // must supply its own isSatisfiedBy.
      throw new Error(`cannot evaluate opaque custom spec '${node.spec}' from its node`);
  }
}

// ---------------------------------------------------------------------------
// Tree → SQL / description (parameter threading)
// ---------------------------------------------------------------------------

/** Render a SpecNode to a WHERE fragment, accumulating bind params. */
export function nodeSql(node: SpecNode): SpecSql {
  const params: unknown[] = [];
  const sql = renderSql(node, params);
  return { sql, params };
}

function renderSql(node: SpecNode, params: unknown[]): string {
  switch (node.kind) {
    case 'leaf':
      return leafSql(node, params);
    case 'logic': {
      const joiner = node.op === 'and' ? ' AND ' : ' OR ';
      return node.children.map((c) => `(${renderSql(c, params)})`).join(joiner);
    }
    case 'not':
      return `NOT (${renderSql(node.child, params)})`;
    case 'custom':
      throw new Error(
        `cannot translate opaque custom spec '${node.spec}' to SQL — ` +
          'override toSql() on the spec class'
      );
  }
}

/** Render a SpecNode to an English description. */
export function nodeDescription(node: SpecNode): string {
  switch (node.kind) {
    case 'leaf':
      return leafDescription(node);
    case 'logic': {
      const joiner = node.op === 'and' ? ' and ' : ' or ';
      return node.children.map((c) => `(${nodeDescription(c)})`).join(joiner);
    }
    case 'not':
      return `not (${nodeDescription(node.child)})`;
    case 'custom':
      return `custom(${node.spec})`;
  }
}

// ---------------------------------------------------------------------------
// Composite specs
// ---------------------------------------------------------------------------

/**
 * AND/OR/NOT combinators as spec classes. They carry child spec
 * *objects* (so `isSatisfiedBy` delegates to real implementations,
 * including custom ones that can't be expressed as trees) while
 * `toNode`/`toSql`/`describe` operate on the serialized trees — custom
 * specs without translatable trees will throw on toSql, which is
 * correct behavior for opaque rules.
 */
abstract class CompositeSpec<T> extends Specification<T> {
  constructor(protected readonly _left: ISpecification<T>, protected readonly _right: ISpecification<T>) {
    super();
  }

  protected _childNode(s: ISpecification<T>): SpecNode {
    return s.toNode();
  }
}

export class AndSpec<T> extends CompositeSpec<T> {
  readonly name: string;

  constructor(left: ISpecification<T>, right: ISpecification<T>) {
    super(left, right);
    this.name = `${left.name}.and.${right.name}`;
  }

  isSatisfiedBy(candidate: T): boolean {
    return this._left.isSatisfiedBy(candidate) && this._right.isSatisfiedBy(candidate);
  }

  toNode(): SpecNode {
    const node: SpecLogic = {
      kind: 'logic',
      op: 'and',
      children: [this._childNode(this._left), this._childNode(this._right)],
    };
    return node;
  }
}

export class OrSpec<T> extends CompositeSpec<T> {
  readonly name: string;

  constructor(left: ISpecification<T>, right: ISpecification<T>) {
    super(left, right);
    this.name = `${left.name}.or.${right.name}`;
  }

  isSatisfiedBy(candidate: T): boolean {
    return this._left.isSatisfiedBy(candidate) || this._right.isSatisfiedBy(candidate);
  }

  toNode(): SpecNode {
    const node: SpecLogic = {
      kind: 'logic',
      op: 'or',
      children: [this._childNode(this._left), this._childNode(this._right)],
    };
    return node;
  }
}

export class NotSpec<T> extends Specification<T> {
  readonly name: string;
  private readonly _inner: ISpecification<T>;

  constructor(inner: ISpecification<T>) {
    super();
    this._inner = inner;
    this.name = `${inner.name}.not`;
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this._inner.isSatisfiedBy(candidate);
  }

  toNode(): SpecNode {
    return { kind: 'not', child: this._inner.toNode() };
  }
}

/**
 * Adapter: wrap an arbitrary predicate as a spec. The predicate is
 * opaque (can't serialize or translate) — use for quick one-off rules;
 * use LeafSpec subclasses when translation matters.
 */
export class PredicateSpec<T> extends Specification<T> {
  readonly name: string;
  private readonly _fn: (candidate: T) => boolean;
  private readonly _label: string;
  private readonly _params: Record<string, unknown>;

  constructor(name: string, fn: (candidate: T) => boolean, label?: string, params?: Record<string, unknown>) {
    super();
    this.name = name;
    this._fn = fn;
    this._label = label ?? name;
    this._params = params ?? {};
  }

  isSatisfiedBy(candidate: T): boolean {
    return this._fn(candidate);
  }

  toNode(): SpecNode {
    return { kind: 'custom', spec: this.name, params: this._params };
  }

  override describe(): string {
    return this._label;
  }
}
