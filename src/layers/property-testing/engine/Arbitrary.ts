/**
 * Arbitrary — random generators with integrated shrinking
 *
 * The heart of property-based testing (QuickCheck/fast-check model):
 * an `Arbitrary<T>` produces random values AND knows how to shrink a
 * failing case toward a minimal counterexample.
 *
 * Shrinking uses a lazy tree: `ShrinkTree<T>` has a value plus a
 * stream of smaller candidates. The runner walks the tree greedily —
 * whenever a child still fails it becomes the new current node —
 * guaranteeing a local minimum in O(tree-depth) evaluations.
 *
 * Shrink strategies per type (standard heuristics):
 *  - numbers: toward 0 via binary-search steps + unit decrements
 *  - strings: toward '' by halving length, then per-character shrink
 *  - arrays: remove half the elements, remove each element, then
 *    shrink individual elements
 *  - objects: shrink each field in turn
 *  - tuples: shrink left-to-right
 *
 * Determinism: all generators take a seeded PRNG so runs reproduce.
 *
 * @module PropertyTesting/Engine
 */

/* ------------------------------------------------------------------------ */
/* PRNG                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * mulberry32 — deterministic 32-bit PRNG. Same generator used across
 * engines in this codebase; period 2^32, fast, seedable.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SplitMix-style seed expansion for derived streams. */
export function deriveSeed(seed: number, salt: number): number {
  let z = (seed + salt * 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/* ------------------------------------------------------------------------ */
/* Shrink tree                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Lazy shrink tree: `value` plus candidate smaller values.
 * `candidates` is a function so trees only materialize on demand.
 */
export interface ShrinkTree<T> {
  readonly value: T;
  readonly candidates: () => readonly ShrinkTree<T>[];
}

export function leaf<T>(value: T): ShrinkTree<T> {
  return { value, candidates: () => [] };
}

/**
 * Greedy minimization: descend into the first child that still
 * satisfies `fails` (the predicate that detected the bug — "still
 * reproduces"). Returns the smallest failing value found.
 *
 * Termination is guaranteed because every candidate is strictly
 * "smaller" per each arbitrary's well-founded measure.
 */
export function shrinkToMinimal<T>(
  tree: ShrinkTree<T>,
  fails: (v: T) => boolean,
  maxEvals = 10_000
): { value: T; evals: number } {
  let current = tree;
  let evals = 0;
  let improved = true;
  while (improved && evals < maxEvals) {
    improved = false;
    for (const child of current.candidates()) {
      evals++;
      if (evals >= maxEvals) break;
      if (fails(child.value)) {
        current = child;
        improved = true;
        break;
      }
    }
  }
  return { value: current.value, evals };
}

/* ------------------------------------------------------------------------ */
/* Arbitrary                                                                */
/* ------------------------------------------------------------------------ */

/** A random value generator with a shrink tree. */
export interface Arbitrary<T> {
  /** Draw a random shrink tree. */
  generate(rand: () => number): ShrinkTree<T>;
  /**
   * Whether `value` is in this arbitrary's domain — used to filter
   * preconditions (`.suchThat`-style checks in properties).
   */
  canGenerate?(value: unknown): value is T;
}

/** Map an arbitrary's output type. Shrinks map back lazily. */
export function mapArbitrary<A, B>(
  arb: Arbitrary<A>,
  to: (a: A) => B
): Arbitrary<B> {
  return {
    generate(rand) {
      const t = arb.generate(rand);
      const map = (node: ShrinkTree<A>): ShrinkTree<B> => ({
        value: to(node.value),
        candidates: () => node.candidates().map(map),
      });
      return map(t);
    },
  };
}

/** Filter an arbitrary (may shrink to values violating the predicate —
 * the runner's precondition check handles those as skips). */
export function filterArbitrary<T>(
  arb: Arbitrary<T>,
  pred: (t: T) => boolean,
  maxRetries = 100
): Arbitrary<T> {
  return {
    canGenerate: (v): v is T => arb.canGenerate?.(v) === true && pred(v as T),
    generate(rand) {
      for (let i = 0; i < maxRetries; i++) {
        const t = arb.generate(rand);
        if (pred(t.value)) return t;
      }
      // give up: return unfiltered tree; runner precondition skips it
      return arb.generate(rand);
    },
  };
}

/** Constant arbitrary — never shrinks. */
export function constant<T>(value: T): Arbitrary<T> {
  return { generate: () => leaf(value) };
}

/* ------------------------------------------------------------------------ */
/* Primitives                                                               */
/* ------------------------------------------------------------------------ */

export interface IntOptions {
  readonly min?: number;
  readonly max?: number;
}

/**
 * Integer arbitrary in [min, max]. Shrinks toward 0 (or toward the
 * bound closest to 0 when 0 is out of range) via binary halving then
 * linear decrement — O(log n) candidate chain.
 */
export function int(options: IntOptions = {}): Arbitrary<number> {
  const min = options.min ?? -2_147_483_648;
  const max = options.max ?? 2_147_483_647;
  if (min > max) throw new Error('int: min > max');
  const target = 0 >= min && 0 <= max ? 0 : Math.abs(min) <= Math.abs(max) ? min : max;

  const shrinkChain = (v: number): readonly ShrinkTree<number>[] => {
    const out: ShrinkTree<number>[] = [];
    if (v === target) return out;
    // binary steps toward target: halve the distance each time
    let step = Math.abs(v - target);
    while (step > 0) {
      const next = v + Math.sign(target - v) * Math.ceil(step / 2);
      if (next !== v) out.push(node(next));
      step = Math.floor(step / 2);
    }
    // final unit steps for odd residuals
    if (Math.abs(v - target) > 1) {
      out.push(node(v + Math.sign(target - v)));
    }
    return out;
  };
  const node = (v: number): ShrinkTree<number> => ({
    value: v,
    candidates: () => shrinkChain(v),
  });

  return {
    canGenerate: (v): v is number =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
    generate(rand) {
      const v = min + Math.floor(rand() * (max - min + 1));
      return node(v);
    },
  };
}

export interface FloatOptions {
  readonly min?: number;
  readonly max?: number;
  /** allow NaN/Infinity in the domain (default false) */
  readonly allowNonFinite?: boolean;
}

/** Float arbitrary. Shrinks toward 0 by halving magnitude. */
export function float(options: FloatOptions = {}): Arbitrary<number> {
  const min = options.min ?? -1e6;
  const max = options.max ?? 1e6;
  const nonFinite = options.allowNonFinite ?? false;
  const node = (v: number): ShrinkTree<number> => ({
    value: v,
    candidates: () => {
      const out: ShrinkTree<number>[] = [];
      if (v !== 0 && Number.isFinite(v)) {
        out.push(node(0));
        out.push(node(Math.trunc(v))); // toward integer
        out.push(node(v / 2));
      }
      return out;
    },
  });
  return {
    canGenerate: (v): v is number =>
      typeof v === 'number' && (nonFinite || Number.isFinite(v)) && v >= min && v <= max,
    generate(rand) {
      return node(min + rand() * (max - min));
    },
  };
}

/** Boolean arbitrary — shrinks true → false. */
export function boolean(): Arbitrary<boolean> {
  return {
    canGenerate: (v): v is boolean => typeof v === 'boolean',
    generate(rand) {
      const v = rand() < 0.5;
      return {
        value: v,
        candidates: () => (v ? [leaf(false)] : []),
      };
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Strings                                                                  */
/* ------------------------------------------------------------------------ */

export interface StringOptions {
  readonly charset?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
}

const DEFAULT_CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

/**
 * String arbitrary with charset control.
 * Shrinks: empty string first, then halved lengths, then
 * character-simplification (toward charset[0]).
 */
export function string(options: StringOptions = {}): Arbitrary<string> {
  const charset = options.charset ?? DEFAULT_CHARSET;
  const minLen = options.minLength ?? 0;
  const maxLen = options.maxLength ?? 64;
  if (charset.length === 0 && maxLen > 0) throw new Error('string: empty charset');

  const node = (s: string): ShrinkTree<string> => ({
    value: s,
    candidates: () => {
      const out: ShrinkTree<string>[] = [];
      if (s.length > minLen) {
        out.push(node(s.slice(0, minLen))); // minimal length
        out.push(node(s.slice(0, Math.ceil(s.length / 2)))); // half
      }
      // simplify each char toward charset[0]
      for (let i = 0; i < Math.min(s.length, 8); i++) {
        const idx = charset.indexOf(s[i]);
        if (idx > 0) {
          out.push(node(s.slice(0, i) + charset[0] + s.slice(i + 1)));
          if (idx > 1) {
            out.push(node(s.slice(0, i) + charset[Math.floor(idx / 2)] + s.slice(i + 1)));
          }
        }
      }
      return out;
    },
  });

  return {
    canGenerate: (v): v is string =>
      typeof v === 'string' &&
      v.length >= minLen &&
      v.length <= maxLen &&
      [...v].every((c) => charset.includes(c)),
    generate(rand) {
      const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
      let s = '';
      for (let i = 0; i < len; i++) {
        s += charset[Math.floor(rand() * charset.length)];
      }
      return node(s);
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Composites                                                               */
/* ------------------------------------------------------------------------ */

export interface ArrayOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
}

/**
 * Array arbitrary. Shrink order (fast-check convention):
 *   1. bulk-remove: drop to minLength, halve, drop tail half
 *   2. remove each element one at a time
 *   3. shrink individual elements
 */
export function array<T>(item: Arbitrary<T>, options: ArrayOptions = {}): Arbitrary<T[]> {
  const minLen = options.minLength ?? 0;
  const maxLen = options.maxLength ?? 16;

  const node = (trees: readonly ShrinkTree<T>[]): ShrinkTree<T[]> => ({
    value: trees.map((t) => t.value),
    candidates: () => {
      const out: ShrinkTree<T[]>[] = [];
      const n = trees.length;
      if (n > minLen) {
        out.push(node(trees.slice(0, minLen)));
        const half = Math.max(minLen, Math.floor(n / 2));
        out.push(node(trees.slice(0, half)));
        out.push(node(trees.slice(n - half)));
        // remove each single element
        for (let i = 0; i < n; i++) {
          out.push(node([...trees.slice(0, i), ...trees.slice(i + 1)]));
        }
      }
      // shrink elements
      for (let i = 0; i < n; i++) {
        for (const c of trees[i].candidates()) {
          out.push(node([...trees.slice(0, i), c, ...trees.slice(i + 1)]));
        }
      }
      return out;
    },
  });

  return {
    generate(rand) {
      const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
      const trees: ShrinkTree<T>[] = [];
      for (let i = 0; i < len; i++) trees.push(item.generate(rand));
      return node(trees);
    },
  };
}

/** Fixed-size tuple arbitrary. Shrinks each position left-to-right. */
export function tuple<T extends readonly unknown[]>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  const node = (trees: readonly ShrinkTree<unknown>[]): ShrinkTree<T> => ({
    value: trees.map((t) => t.value) as unknown as T,
    candidates: () => {
      const out: ShrinkTree<T>[] = [];
      for (let i = 0; i < trees.length; i++) {
        for (const c of trees[i].candidates()) {
          const next = [...trees];
          next[i] = c;
          out.push(node(next));
        }
      }
      return out;
    },
  });
  return {
    generate(rand) {
      const trees = items.map((i) => i.generate(rand));
      return node(trees);
    },
  };
}

export interface ObjectOptions {
  /** extra keys of unknown content allowed */
  readonly exact?: boolean;
}

/**
 * Object arbitrary from a shape spec `{ key: arbitrary }`.
 * Shrinks each field independently.
 */
export function record<T extends Record<string, unknown>>(
  shape: { [K in keyof T]: Arbitrary<T[K]> },
  _options: ObjectOptions = {}
): Arbitrary<T> {
  const keys = Object.keys(shape) as (keyof T)[];
  const node = (trees: Map<keyof T, ShrinkTree<T[keyof T]>>): ShrinkTree<T> => ({
    value: Object.fromEntries([...trees].map(([k, t]) => [k, t.value])) as T,
    candidates: () => {
      const out: ShrinkTree<T>[] = [];
      for (const k of keys) {
        const t = trees.get(k);
        if (!t) continue;
        for (const c of t.candidates()) {
          const next = new Map(trees);
          next.set(k, c as ShrinkTree<T[keyof T]>);
          out.push(node(next));
        }
      }
      return out;
    },
  });
  return {
    generate(rand) {
      const trees = new Map<keyof T, ShrinkTree<T[keyof T]>>();
      for (const k of keys) {
        trees.set(k, shape[k].generate(rand) as ShrinkTree<T[keyof T]>);
      }
      return node(trees);
    },
  };
}

/** Union: one-of several arbitraries. Shrinks stay within the chosen arm. */
export function oneOf<T>(...arbs: readonly Arbitrary<T>[]): Arbitrary<T> {
  if (arbs.length === 0) throw new Error('oneOf: empty');
  return {
    generate(rand) {
      const idx = Math.floor(rand() * arbs.length);
      return arbs[idx].generate(rand);
    },
  };
}

/** Frequency-weighted one-of. */
export function frequency<T>(
  ...weighted: readonly { weight: number; arb: Arbitrary<T> }[]
): Arbitrary<T> {
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) throw new Error('frequency: nonpositive total weight');
  return {
    generate(rand) {
      let r = rand() * total;
      for (const w of weighted) {
        r -= w.weight;
        if (r <= 0) return w.arb.generate(rand);
      }
      return weighted[weighted.length - 1].arb.generate(rand);
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Recursive structures                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Recursive arbitrary builder — mirrors fast-check `letrec`.
 *
 * `builder(self)` receives the lazy recursive reference; `maxDepth`
 * bounds nesting by degrading `self` to `base` once exhausted.
 * Shrinking descends only within already-chosen nodes (depth can't grow).
 */
export function recursive<T>(
  base: Arbitrary<T>,
  builder: (self: Arbitrary<T>) => Arbitrary<T>,
  maxDepth = 4
): Arbitrary<T> {
  let depth = 0;
  const self: Arbitrary<T> = {
    generate(rand) {
      depth++;
      try {
        const arb = depth > maxDepth ? base : builder(self);
        return arb.generate(rand);
      } finally {
        depth--;
      }
    },
  };
  return builder(self);
}

/** JSON-ish value arbitrary: recursive trees of primitives. */
export function jsonValue(maxDepth = 3): Arbitrary<unknown> {
  const base = oneOf<unknown>(
    constant(null),
    boolean() as Arbitrary<unknown>,
    int({ min: -1000, max: 1000 }) as Arbitrary<unknown>,
    string({ maxLength: 16 }) as Arbitrary<unknown>
  );
  return recursive<unknown>(
    base,
    (self) =>
      frequency<unknown>(
        { weight: 4, arb: base },
        { weight: 1, arb: array(self, { maxLength: 4 }) as Arbitrary<unknown> },
        {
          weight: 1,
          arb: record<Record<string, unknown>>(
            { a: self, b: self },
            {}
          ) as Arbitrary<unknown>,
        }
      ),
    maxDepth
  );
}
