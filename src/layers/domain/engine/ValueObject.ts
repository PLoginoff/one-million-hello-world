/**
 * Value Object Base — Structural Equality
 *
 * Value objects are defined entirely by their attributes — two objects
 * with the same fields are interchangeable. This base provides
 * `equals()` based on a deep structural comparison rather than identity
 * (`===`).
 *
 * Rules:
 * - Subclasses implement `getEqualityComponents()` returning the fields
 *   that define identity (in declaration order).
 * - Equality is order-sensitive in arrays, order-insensitive in plain
 *   objects (keys are sorted before comparison).
 * - Cyclic structures are detected and rejected — value objects are
 *   immutable leaves, not graphs.
 *
 * @module DomainLayer/Engine
 */

import { ValueObject } from '../types/domain-types';

/**
 * Structural equality: deep comparison treating objects as unordered
 * field-sets and arrays as ordered sequences.
 *
 * @param visited Cycle-detection pair set — internal.
 */
export function structuralEquals(
  a: unknown,
  b: unknown,
  visited?: Set<readonly [object, object]>
): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  // Cycle detection — same pair of objects revisited means the
  // subgraphs are structurally equivalent.
  const seen = visited ?? new Set<readonly [object, object]>();
  const pair = [a as object, b as object] as const;
  if (seen.has(pair)) {
    return true;
  }
  seen.add(pair);

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!structuralEquals(a[i], b[i], seen)) {
        return false;
      }
    }
    return true;
  }

  // Plain objects: compare key sets then values.
  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
    if (
      !structuralEquals(
        (a as Record<string, unknown>)[aKeys[i]],
        (b as Record<string, unknown>)[bKeys[i]],
        seen
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Base class for value objects with structural equality.
 */
export abstract class ValueObjectBase implements ValueObject {
  /**
   * The fields defining this value object's identity. Order matters
   * for subclasses that intentionally keep ordered components.
   */
  protected abstract getEqualityComponents(): readonly unknown[];

  /**
   * Structural equality against another value object. Type check via
   * the concrete subclass — a `Money` never equals a `Weight` even
   * if their components happen to match.
   */
  equals(other: ValueObject): boolean {
    if (!(other instanceof (this.constructor as new () => ValueObjectBase))) {
      return false;
    }
    if (other === this) {
      return true;
    }
    const otherVO = other as ValueObjectBase;
    return structuralEquals(this.getEqualityComponents(), otherVO.getEqualityComponents());
  }

  /**
   * String form — the joined components. Useful for maps/dedup.
   */
  toString(): string {
    return `${this.constructor.name}(${this.getEqualityComponents().map((c) => String(c)).join(',')})`;
  }
}
