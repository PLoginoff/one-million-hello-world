/**
 * Specification Pattern
 *
 * Composable domain rules: each spec is a named predicate; combinators
 * (`and`, `or`, `not`) produce new specs whose failure reporting walks
 * the tree and names *which* leaf rules rejected a candidate.
 *
 * @module DomainLayer/Engine
 */

import { Specification, SpecificationReport } from './types';

/** Implementation node of the composite spec tree. */
class Spec<T> implements Specification<T> {
  readonly name: string;
  private readonly _predicate: (candidate: T) => boolean;
  private readonly _children?: readonly Spec<T>[];
  private readonly _op?: 'and' | 'or' | 'not';

  private constructor(
    name: string,
    predicate: (candidate: T) => boolean,
    children?: readonly Spec<T>[],
    op?: 'and' | 'or' | 'not'
  ) {
    this.name = name;
    this._predicate = predicate;
    this._children = children;
    this._op = op;
  }

  static leaf<T>(name: string, predicate: (candidate: T) => boolean): Spec<T> {
    return new Spec(name, predicate);
  }

  isSatisfiedBy(candidate: T): boolean {
    return this._predicate(candidate);
  }

  and(other: Specification<T>): Specification<T> {
    const otherSpec = other as Spec<T>;
    return new Spec<T>(
      `(${this.name} AND ${other.name})`,
      (c) => this.isSatisfiedBy(c) && other.isSatisfiedBy(c),
      [this, otherSpec],
      'and'
    );
  }

  or(other: Specification<T>): Specification<T> {
    const otherSpec = other as Spec<T>;
    return new Spec<T>(
      `(${this.name} OR ${other.name})`,
      (c) => this.isSatisfiedBy(c) || other.isSatisfiedBy(c),
      [this, otherSpec],
      'or'
    );
  }

  not(): Specification<T> {
    return new Spec<T>(
      `NOT ${this.name}`,
      (c) => !this.isSatisfiedBy(c),
      [this],
      'not'
    );
  }

  /**
   * Collect the names of leaf rules that failed — useful for rich
   * rejection messages ("user is under-age", not just "spec failed").
   */
  failingLeaves(candidate: T): readonly string[] {
    if (this._op === undefined || this._children === undefined) {
      return this.isSatisfiedBy(candidate) ? [] : [this.name];
    }
    if (this._op === 'and') {
      return this._children.flatMap((c) => c.failingLeaves(candidate));
    }
    if (this._op === 'or') {
      // An OR fails only when all children fail — report all of them.
      if (this.isSatisfiedBy(candidate)) {
        return [];
      }
      return this._children.flatMap((c) => c.failingLeaves(candidate));
    }
    // not: report the child's name when the negation failed.
    return this.isSatisfiedBy(candidate) ? [] : [this.name];
  }
}

/**
 * Build a named spec from a predicate.
 */
export function spec<T>(name: string, predicate: (candidate: T) => boolean): Specification<T> {
  return Spec.leaf(name, predicate);
}

/**
 * Evaluate a spec and produce a structured report.
 */
export function evaluate<T>(specification: Specification<T>, candidate: T): SpecificationReport {
  const satisfied = specification.isSatisfiedBy(candidate);
  const failures = satisfied ? [] : (specification as Spec<T>).failingLeaves(candidate);
  return { satisfied, failures };
}

/** Common spec combinators as free functions. */
export function allOf<T>(...specs: readonly Specification<T>[]): Specification<T> {
  if (specs.length === 0) {
    return spec('always-true', () => true);
  }
  return specs.reduce((acc, s) => acc.and(s));
}

export function anyOf<T>(...specs: readonly Specification<T>[]): Specification<T> {
  if (specs.length === 0) {
    return spec('always-false', () => false);
  }
  return specs.reduce((acc, s) => acc.or(s));
}
