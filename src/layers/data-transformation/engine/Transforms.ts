/**
 * Transforms
 *
 * Post-coercion value transforms usable in `MappingRule.transform`.
 * Named builtins are total functions — they never throw on type mismatch;
 * they pass the value through unchanged instead (a no-op), keeping rules
 * composable without per-type guard clutter. Inline function transforms
 * may throw; the engine catches and wraps them as TransformError.
 *
 * @module DataTransformationLayer/Engine
 */

import { ValueTransform } from './types';

/**
 * Named builtin transforms. Each is total: wrong-typed input passes
 * through untouched so transform lists stay declarative.
 */
export const BUILTIN_TRANSFORMS: Record<string, (value: unknown) => unknown> = {
  trim: (v) => (typeof v === 'string' ? v.trim() : v),
  lowercase: (v) => (typeof v === 'string' ? v.toLowerCase() : v),
  uppercase: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  abs: (v) => (typeof v === 'number' ? Math.abs(v) : v),
  floor: (v) => (typeof v === 'number' ? Math.floor(v) : v),
  ceil: (v) => (typeof v === 'number' ? Math.ceil(v) : v),
  round: (v) => (typeof v === 'number' ? Math.round(v) : v),
  negate: (v) => (typeof v === 'number' ? -v : typeof v === 'boolean' ? !v : v),
  json: (v) => {
    try {
      return JSON.stringify(v);
    } catch {
      return v;
    }
  },
  parseJson: (v) => {
    if (typeof v !== 'string') {
      return v;
    }
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return v;
    }
  },
  first: (v) => (Array.isArray(v) ? v[0] : typeof v === 'string' ? v.charAt(0) : v),
  last: (v) =>
    Array.isArray(v) ? v[v.length - 1] : typeof v === 'string' ? v.charAt(v.length - 1) : v,
  count: (v) => {
    if (Array.isArray(v) || typeof v === 'string') {
      return v.length;
    }
    if (v !== null && typeof v === 'object') {
      return Object.keys(v).length;
    }
    return v;
  },
  keys: (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : v),
  values: (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : v,
  flatten: (v) => (Array.isArray(v) ? flattenDeep(v) : v),
  unique: (v) => (Array.isArray(v) ? uniqueByIdentity(v) : v),
};

/**
 * Resolves a transform to a callable.
 */
export function resolveTransform(t: ValueTransform): (value: unknown) => unknown {
  if (typeof t === 'string') {
    const fn = BUILTIN_TRANSFORMS[t];
    if (!fn) {
      throw new Error(`Unknown builtin transform '${t}'`);
    }
    return fn;
  }
  return t;
}

/**
 * Applies a transform list left-to-right.
 */
export function applyTransforms(
  value: unknown,
  transforms: ValueTransform | readonly ValueTransform[] | undefined
): unknown {
  if (transforms === undefined) {
    return value;
  }
  const list = Array.isArray(transforms) ? transforms : [transforms];
  let current = value;
  for (const t of list) {
    current = resolveTransform(t)(current);
  }
  return current;
}

/**
 * Recursive array flatten: [[1,2],[3,[4]]] → [1,2,3,4]. O(n) elements.
 */
export function flattenDeep(input: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  const stack: unknown[] = [...input];
  while (stack.length > 0) {
    const item = stack.shift();
    if (Array.isArray(item)) {
      // splice-insert the nested items at the front to preserve order
      stack.unshift(...item);
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * Dedupe preserving first-occurrence order. Uses Set for O(n) primitives;
 * objects dedupe by reference identity (via Set) — document that strings
 * dedupe by value but distinct objects are never collapsed.
 */
export function uniqueByIdentity(input: readonly unknown[]): unknown[] {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const item of input) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}
