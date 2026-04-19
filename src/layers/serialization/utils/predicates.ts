/**
 * Predicates
 * 
 * Predicate functions for data validation and filtering.
 */

export type Predicate<T = unknown> = (value: T) => boolean;

export function always<T>(value: T): Predicate<T> {
  return () => true;
}

export function never<T>(value: T): Predicate<T> {
  return () => false;
}

export function eq<T>(expected: T): Predicate<T> {
  return (value) => value === expected;
}

export function neq<T>(expected: T): Predicate<T> {
  return (value) => value !== expected;
}

export function gt<T extends number>(threshold: T): Predicate<T> {
  return (value) => value > threshold;
}

export function gte<T extends number>(threshold: T): Predicate<T> {
  return (value) => value >= threshold;
}

export function lt<T extends number>(threshold: T): Predicate<T> {
  return (value) => value < threshold;
}

export function lte<T extends number>(threshold: T): Predicate<T> {
  return (value) => value <= threshold;
}

export function between<T extends number>(min: T, max: T): Predicate<T> {
  return (value) => value >= min && value <= max;
}

export function inRange<T extends number>(min: T, max: T, inclusive: boolean = true): Predicate<T> {
  return inclusive ? between(min, max) : (value) => value > min && value < max;
}

export function contains<T>(expected: T): Predicate<T[]> {
  return (array) => Array.isArray(array) && array.includes(expected);
}

export function includes<T>(expected: T): Predicate<string> {
  return (str) => typeof str === 'string' && str.includes(expected as string);
}

export function startsWith<T extends string>(prefix: T): Predicate<T> {
  return (str) => typeof str === 'string' && str.startsWith(prefix);
}

export function endsWith<T extends string>(suffix: T): Predicate<T> {
  return (str) => typeof str === 'string' && str.endsWith(suffix);
}

export function matches<T extends string>(pattern: RegExp): Predicate<T> {
  return (str) => typeof str === 'string' && pattern.test(str);
}

export function hasLength<T extends string | unknown[]>(length: number): Predicate<T> {
  return (value) => value.length === length;
}

export function hasMinLength<T extends string | unknown[]>(min: number): Predicate<T> {
  return (value) => value.length >= min;
}

export function hasMaxLength<T extends string | unknown[]>(max: number): Predicate<T> {
  return (value) => value.length <= max;
}

export function hasLengthBetween<T extends string | unknown[]>(min: number, max: number): Predicate<T> {
  return (value) => value.length >= min && value.length <= max;
}

export function isOneOf<T>(...values: T[]): Predicate<T> {
  return (value) => values.includes(value);
}

export function isNoneOf<T>(...values: T[]): Predicate<T> {
  return (value) => !values.includes(value);
}

export function and<T>(...predicates: Predicate<T>[]): Predicate<T> {
  return (value) => predicates.every(p => p(value));
}

export function or<T>(...predicates: Predicate<T>[]): Predicate<T> {
  return (value) => predicates.some(p => p(value));
}

export function not<T>(predicate: Predicate<T>): Predicate<T> {
  return (value) => !predicate(value);
}

export function xor<T>(p1: Predicate<T>, p2: Predicate<T>): Predicate<T> {
  return (value) => p1(value) !== p2(value);
}

export function nand<T>(...predicates: Predicate<T>[]): Predicate<T> {
  return not(and(...predicates));
}

export function nor<T>(...predicates: Predicate<T>[]): Predicate<T> {
  return not(or(...predicates));
}

export function ifElse<T>(
  condition: Predicate<T>,
  thenPredicate: Predicate<T>,
  elsePredicate: Predicate<T>
): Predicate<T> {
  return (value) => condition(value) ? thenPredicate(value) : elsePredicate(value);
}

export function compose<T, U, V>(
  p1: Predicate<V>,
  p2: (value: V) => U,
  p3: (value: U) => T
): Predicate<V> {
  return (value) => p1(p2(p3(value)));
}

export function memoize<T>(predicate: Predicate<T>): Predicate<T> {
  const cache = new Map<T, boolean>();
  return (value) => {
    if (cache.has(value)) {
      return cache.get(value)!;
    }
    const result = predicate(value);
    cache.set(value, result);
    return result;
  };
}

export function debounce<T>(predicate: Predicate<T>, delay: number): Predicate<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastResult: boolean = false;

  return (value) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      lastResult = predicate(value);
      timeoutId = null;
    }, delay);
    return lastResult;
  };
}

export function throttle<T>(predicate: Predicate<T>, interval: number): Predicate<T> {
  let lastCall = 0;
  let lastResult: boolean = false;

  return (value) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastResult = predicate(value);
      lastCall = now;
    }
    return lastResult;
  };
}
