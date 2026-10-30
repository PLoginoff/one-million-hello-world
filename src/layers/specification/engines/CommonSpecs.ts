/**
 * CommonSpecs — the built-in leaf specification library.
 *
 * Each class is a *parameterized* specification: constructor arguments
 * are the rule's parameters, stored in the serialized node so specs
 * round-trip through JSON. `isSatisfiedBy` delegates to the shared
 * leaf evaluator so spec behavior and SQL/description rendering can
 * never drift apart.
 *
 *   new GreaterThan('age', 18)
 *   new In('status', ['active','trial'])
 *   new Contains('email', '@corp.com')
 *   new Between('price', 10, 99)
 *   new Matches('sku', /^[A-Z]{3}-\d+$/)
 *
 * @module Specification/Engines
 */

import { evalNode, Specification } from './Specification';
import { SpecLeaf, SpecNode, SpecOp } from './types';

type Row = Record<string, unknown>;

function leaf(field: string, op: SpecOp, value?: unknown, value2?: unknown): SpecLeaf {
  return { kind: 'leaf', field, op, value, value2 };
}

/** Shared base: a leaf spec evaluated via the shared node evaluator. */
abstract class LeafSpecification<T = Row> extends Specification<T> {
  protected abstract readonly _node: SpecLeaf;

  isSatisfiedBy(candidate: T): boolean {
    return evalNode(this._node, candidate);
  }

  toNode(): SpecNode {
    return this._node;
  }
}

/** `field = value`. */
export class Equal<T = Row> extends LeafSpecification<T> {
  readonly name = 'Equal';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: unknown) {
    super();
    this._node = leaf(field, SpecOp.Eq, value);
  }
}

/** `field <> value`. */
export class NotEqual<T = Row> extends LeafSpecification<T> {
  readonly name = 'NotEqual';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: unknown) {
    super();
    this._node = leaf(field, SpecOp.Ne, value);
  }
}

/** `field > value`. */
export class GreaterThan<T = Row> extends LeafSpecification<T> {
  readonly name = 'GreaterThan';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: number | Date | string) {
    super();
    this._node = leaf(field, SpecOp.Gt, value);
  }
}

/** `field >= value`. */
export class GreaterThanOrEqual<T = Row> extends LeafSpecification<T> {
  readonly name = 'GreaterThanOrEqual';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: number | Date | string) {
    super();
    this._node = leaf(field, SpecOp.Gte, value);
  }
}

/** `field < value`. */
export class LessThan<T = Row> extends LeafSpecification<T> {
  readonly name = 'LessThan';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: number | Date | string) {
    super();
    this._node = leaf(field, SpecOp.Lt, value);
  }
}

/** `field <= value`. */
export class LessThanOrEqual<T = Row> extends LeafSpecification<T> {
  readonly name = 'LessThanOrEqual';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: number | Date | string) {
    super();
    this._node = leaf(field, SpecOp.Lte, value);
  }
}

/** `field IN (values...)`. */
export class In<T = Row> extends LeafSpecification<T> {
  readonly name = 'In';
  protected readonly _node: SpecLeaf;
  constructor(field: string, values: readonly unknown[]) {
    super();
    this._node = leaf(field, SpecOp.In, [...values]);
  }
}

/** `field NOT IN (values...)`. */
export class NotIn<T = Row> extends LeafSpecification<T> {
  readonly name = 'NotIn';
  protected readonly _node: SpecLeaf;
  constructor(field: string, values: readonly unknown[]) {
    super();
    this._node = leaf(field, SpecOp.NotIn, [...values]);
  }
}

/** String contains / array element membership. */
export class Contains<T = Row> extends LeafSpecification<T> {
  readonly name = 'Contains';
  protected readonly _node: SpecLeaf;
  constructor(field: string, value: unknown) {
    super();
    this._node = leaf(field, SpecOp.Contains, value);
  }
}

/** `field LIKE 'prefix%'`. */
export class StartsWith<T = Row> extends LeafSpecification<T> {
  readonly name = 'StartsWith';
  protected readonly _node: SpecLeaf;
  constructor(field: string, prefix: string) {
    super();
    this._node = leaf(field, SpecOp.StartsWith, prefix);
  }
}

/** `field LIKE '%suffix'`. */
export class EndsWith<T = Row> extends LeafSpecification<T> {
  readonly name = 'EndsWith';
  protected readonly _node: SpecLeaf;
  constructor(field: string, suffix: string) {
    super();
    this._node = leaf(field, SpecOp.EndsWith, suffix);
  }
}

/** Regular-expression match. */
export class Matches<T = Row> extends LeafSpecification<T> {
  readonly name = 'Matches';
  protected readonly _node: SpecLeaf;
  constructor(field: string, pattern: RegExp | string, flags?: string) {
    super();
    const lit =
      typeof pattern === 'string'
        ? { source: pattern, flags: flags ?? '' }
        : { source: pattern.source, flags: pattern.flags };
    this._node = leaf(field, SpecOp.Matches, lit);
  }
}

/** Inclusive range `lo <= field <= hi`. */
export class Between<T = Row> extends LeafSpecification<T> {
  readonly name = 'Between';
  protected readonly _node: SpecLeaf;
  constructor(field: string, lo: number | Date | string, hi: number | Date | string) {
    super();
    this._node = leaf(field, SpecOp.Between, lo, hi);
  }
}

/** `field IS NULL` (also matches `undefined`). */
export class IsNull<T = Row> extends LeafSpecification<T> {
  readonly name = 'IsNull';
  protected readonly _node: SpecLeaf;
  constructor(field: string) {
    super();
    this._node = leaf(field, SpecOp.IsNull);
  }
}

/** `field IS NOT NULL`. */
export class IsNotNull<T = Row> extends LeafSpecification<T> {
  readonly name = 'IsNotNull';
  protected readonly _node: SpecLeaf;
  constructor(field: string) {
    super();
    this._node = leaf(field, SpecOp.IsNotNull);
  }
}

/** Always-true spec — identity element for `and`. */
export class TrueSpec<T = Row> extends Specification<T> {
  readonly name = 'True';
  isSatisfiedBy(_candidate: T): boolean {
    return true;
  }
  toNode(): SpecNode {
    return leaf('1', SpecOp.Eq, 1);
  }
  override describe(): string {
    return 'true';
  }
}

/** Always-false spec — identity element for `or`. */
export class FalseSpec<T = Row> extends Specification<T> {
  readonly name = 'False';
  isSatisfiedBy(_candidate: T): boolean {
    return false;
  }
  toNode(): SpecNode {
    return leaf('1', SpecOp.Eq, 0);
  }
  override describe(): string {
    return 'false';
  }
}
