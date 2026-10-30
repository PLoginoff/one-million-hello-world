/**
 * Specification Builder
 *
 * Ergonomic, immutable factory for `SpecNode` trees. Every method returns a
 * new `Spec` wrapper (no mutation), so specs compose like values:
 *
 *   const spec = Spec.field('age').gte(18)
 *     .and(Spec.field('name').startsWith('A'))
 *     .or(Spec.field('vip').eq(true));
 *
 * The builder is deliberately thin — it validates structure eagerly (so a
 * malformed spec fails at build time, not mid-query) but defers all
 * evaluation to `SpecCompiler`.
 *
 * @module RepositoryLayer/Engine
 */

import { CmpOp, SpecNode, SpecError } from './types';

/**
 * Fluent wrapper around a `SpecNode`. `node` is the underlying tree and is
 * safe to share because all nodes are deeply immutable by convention
 * (`readonly` fields, no mutator methods).
 */
export class Spec {
  private constructor(public readonly node: SpecNode) {}

  /** Begins a comparison on `field` (dot path, e.g. `address.city`). */
  static field(field: string): FieldBuilder {
    return new FieldBuilder(field);
  }

  /** Wraps an existing raw node (escape hatch). */
  static of(node: SpecNode): Spec {
    Spec.validate(node);
    return new Spec(node);
  }

  /** Spec that matches every row (`WHERE 1=1`). */
  static all(): Spec {
    return new Spec({ kind: 'all' });
  }

  /** Spec that matches nothing (`WHERE 1=0`). */
  static none(): Spec {
    return new Spec({ kind: 'none' });
  }

  static and(...specs: readonly Spec[]): Spec {
    return new Spec({ kind: 'and', children: specs.map((s) => s.node) });
  }

  static or(...specs: readonly Spec[]): Spec {
    return new Spec({ kind: 'or', children: specs.map((s) => s.node) });
  }

  static not(spec: Spec): Spec {
    return new Spec({ kind: 'not', child: spec.node });
  }

  /** `field IN (values...)`. Empty `values` throws — it would be dead code. */
  static in(field: string, values: readonly unknown[]): Spec {
    if (values.length === 0) {
      throw new SpecError(`IN list for field "${field}" must not be empty`);
    }
    return new Spec({ kind: 'in', field, values });
  }

  /** `lo <= field <= hi` (or strict when `inclusive=false`). */
  static between(field: string, lo: unknown, hi: unknown, inclusive = true): Spec {
    return new Spec({ kind: 'between', field, lo, hi, inclusive });
  }

  static isNull(field: string): Spec {
    return new Spec({ kind: 'isNull', field });
  }

  static notNull(field: string): Spec {
    return new Spec({ kind: 'notNull', field });
  }

  and(...others: readonly Spec[]): Spec {
    return Spec.and(this, ...others);
  }

  or(...others: readonly Spec[]): Spec {
    return Spec.or(this, ...others);
  }

  not(): Spec {
    return Spec.not(this);
  }

  /**
   * Structural validation. Walks the tree once — O(nodes).
   * Rejects empty logical groups and blank field names so that compiler
   * output is always meaningful.
   */
  static validate(node: SpecNode): void {
    switch (node.kind) {
      case 'cmp':
      case 'in':
      case 'between':
      case 'isNull':
      case 'notNull':
        if (node.field.trim().length === 0) {
          throw new SpecError(`Spec node "${node.kind}" requires a non-empty field name`);
        }
        if (node.kind === 'in' && node.values.length === 0) {
          throw new SpecError(`IN list for field "${node.field}" must not be empty`);
        }
        return;
      case 'and':
      case 'or':
        if (node.children.length === 0) {
          throw new SpecError(`"${node.kind}" node requires at least one child`);
        }
        node.children.forEach((c) => Spec.validate(c));
        return;
      case 'not':
        Spec.validate(node.child);
        return;
      case 'all':
      case 'none':
        return;
      default: {
        const _exhaustive: never = node;
        throw new SpecError(`Unknown spec node: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}

/**
 * Intermediate builder returned by `Spec.field(name)`. Terminal methods
 * produce a `Spec`; each maps 1:1 to a `cmp` node with a distinct `CmpOp`.
 */
export class FieldBuilder {
  constructor(private readonly field: string) {
    if (field.trim().length === 0) {
      throw new SpecError('Field name must not be empty');
    }
  }

  private cmp(op: CmpOp, value: unknown): Spec {
    return Spec.of({ kind: 'cmp', op, field: this.field, value });
  }

  eq(value: unknown): Spec {
    return this.cmp('eq', value);
  }

  ne(value: unknown): Spec {
    return this.cmp('ne', value);
  }

  gt(value: unknown): Spec {
    return this.cmp('gt', value);
  }

  gte(value: unknown): Spec {
    return this.cmp('gte', value);
  }

  lt(value: unknown): Spec {
    return this.cmp('lt', value);
  }

  lte(value: unknown): Spec {
    return this.cmp('lte', value);
  }

  /** Substring match; `value` is stringified for comparison. */
  contains(value: unknown): Spec {
    return this.cmp('contains', value);
  }

  startsWith(value: unknown): Spec {
    return this.cmp('startsWith', value);
  }

  endsWith(value: unknown): Spec {
    return this.cmp('endsWith', value);
  }

  in(values: readonly unknown[]): Spec {
    return Spec.in(this.field, values);
  }

  between(lo: unknown, hi: unknown, inclusive = true): Spec {
    return Spec.between(this.field, lo, hi, inclusive);
  }

  isNull(): Spec {
    return Spec.isNull(this.field);
  }

  notNull(): Spec {
    return Spec.notNull(this.field);
  }
}
