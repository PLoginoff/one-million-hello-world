/**
 * Gen — fluent monadic generator API
 *
 * A chainable, immutable generator-builder wrapping {@link Arbitrary}.
 * Each combinator produces a new `Gen` whose shrink behavior composes
 * correctly:
 *
 *  - `.map(f)` — transforms generated values; shrinks in mapped space
 *    via the underlying tree (candidates map lazily).
 *  - `.flatMap(f)` — monadic bind; inner arbitrary is drawn at
 *    generation time (dependent values like "array + its length").
 *  - `.filter(pred)` — rejection sampling; marks `canGenerate` so the
 *    runner's precondition system sees the constraint.
 *  - `.zip(other)` — product: pair of values, shrinking each side.
 *  - `.array({min,max})`, `.list(n)`, `.optional()`, `.nullable()` —
 *    collection wrappers with standard shrink orders.
 *  - `.oneOf(...)`, `.weighted(...)` — union composition.
 *  - `.shrinkWith(fn)` — custom post-shrink candidates appended.
 *
 * Mirrors fast-check's fluent API while staying a thin shim over the
 * existing tree machinery — zero new shrink semantics are invented.
 *
 * @module PropertyTesting/Engine
 */

import {
  Arbitrary,
  ShrinkTree,
  mulberry32,
  int,
  float,
  boolean,
  string,
  array,
  tuple,
  record,
  oneOf,
  frequency,
  constant,
  mapArbitrary,
  filterArbitrary,
  leaf,
} from './Arbitrary';

/* ------------------------------------------------------------------------ */
/* Gen class                                                                */
/* ------------------------------------------------------------------------ */

export class Gen<T> {
  constructor(readonly arbitrary: Arbitrary<T>) {}

  /* ---- factory methods ---- */

  /** Wrap an existing arbitrary. */
  static of<T>(arb: Arbitrary<T>): Gen<T> {
    return new Gen(arb);
  }

  /** Constant generator. */
  static constant<T>(v: T): Gen<T> {
    return new Gen(constant(v));
  }

  /** Integer generator. */
  static int(opts?: { min?: number; max?: number }): Gen<number> {
    return new Gen(int(opts));
  }

  /** Float generator. */
  static float(opts?: { min?: number; max?: number }): Gen<number> {
    return new Gen(float(opts));
  }

  /** Boolean generator. */
  static boolean(): Gen<boolean> {
    return new Gen(boolean());
  }

  /** String generator with charset control. */
  static string(opts?: {
    charset?: string;
    minLength?: number;
    maxLength?: number;
  }): Gen<string> {
    return new Gen(string(opts));
  }

  /* ---- combinators ---- */

  /** Transform values. */
  map<B>(f: (v: T) => B): Gen<B> {
    return new Gen(mapArbitrary(this.arbitrary, f));
  }

  /**
   * Monadic bind — inner arbitrary is drawn per outer value.
   * Shrink behavior: outer value shrinks first, then inner.
   */
  flatMap<B>(f: (v: T) => Gen<B>): Gen<B> {
    const outer = this.arbitrary;
    return new Gen<B>({
      generate(rand) {
        const outerTree = outer.generate(rand);
        const inner = f(outerTree.value);
        const innerTree = inner.arbitrary.generate(rand);
        const node = (o: ShrinkTree<T>, i: ShrinkTree<B>): ShrinkTree<B> => ({
          value: i.value,
          candidates: () => {
            const out: ShrinkTree<B>[] = [];
            for (const c of i.candidates()) out.push(node(o, c));
            for (const c of o.candidates()) {
              out.push(node(c, f(c.value).arbitrary.generate(rand).value === i.value ? i : leaf(i.value)));
            }
            return out;
          },
        });
        return node(outerTree, innerTree);
      },
    });
  }

  /** Filter values by predicate (rejection sampling). */
  filter(pred: (v: T) => boolean): Gen<T> {
    return new Gen(filterArbitrary(this.arbitrary, pred));
  }

  /** Pair with another generator. */
  zip<B>(other: Gen<B>): Gen<[T, B]> {
    return new Gen(tuple(this.arbitrary, other.arbitrary));
  }

  /** Triple with two generators. */
  zip3<B, C>(b: Gen<B>, c: Gen<C>): Gen<[T, B, C]> {
    return new Gen(tuple(this.arbitrary, b.arbitrary, c.arbitrary));
  }

  /** Random-length array of this generator. */
  array(opts: { minLength?: number; maxLength?: number } = {}): Gen<T[]> {
    return new Gen(array(this.arbitrary, opts));
  }

  /** Fixed-length array. */
  list(n: number): Gen<T[]> {
    return this.array({ minLength: n, maxLength: n });
  }

  /** `T | undefined` — half the time present. */
  optional(): Gen<T | undefined> {
    return new Gen(oneOf<T | undefined>(this.arbitrary, constant(undefined)));
  }

  /** `T | null`. */
  nullable(): Gen<T | null> {
    return new Gen(oneOf<T | null>(this.arbitrary, constant(null)));
  }

  /** Union with other generators. */
  or(other: Gen<T>): Gen<T> {
    return new Gen(oneOf(this.arbitrary, other.arbitrary));
  }

  /** Weighted union. */
  weighted(other: Gen<T>, weight: number, selfWeight = 1): Gen<T> {
    return new Gen(
      frequency(
        { weight: selfWeight, arb: this.arbitrary },
        { weight, arb: other.arbitrary }
      )
    );
  }

  /**
   * Append custom shrink candidates after the built-ins — candidates
   * produced by `extra` are tried last.
   */
  shrinkWith(extra: (v: T) => readonly T[]): Gen<T> {
    const arb = this.arbitrary;
    const wrap = (t: ShrinkTree<T>): ShrinkTree<T> => ({
      value: t.value,
      candidates: () => [
        ...t.candidates().map(wrap),
        ...extra(t.value).map((v) => leaf(v)),
      ],
    });
    return new Gen<T>({ generate: (r) => wrap(arb.generate(r)) });
  }

  /** Sample N values deterministically. */
  sample(n: number, seed = 1): readonly T[] {
    const rand = mulberry32(seed);
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(this.arbitrary.generate(rand).value);
    return out;
  }

  /** Draw a single value. */
  draw(seed = 1): T {
    return this.arbitrary.generate(mulberry32(seed)).value;
  }
}

/* ------------------------------------------------------------------------ */
/* Object/record builder                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Record builder — `Gen.record({a: Gen.int(), b: Gen.string()})`
 * composes into an object generator with per-field shrinking.
 */
export function genRecord<T extends Record<string, unknown>>(shape: {
  [K in keyof T]: Gen<T[K]>;
}): Gen<T> {
  const arbs = Object.fromEntries(
    Object.entries(shape).map(([k, g]) => [k, (g as Gen<unknown>).arbitrary])
  ) as { [K in keyof T]: Arbitrary<T[K]> };
  return new Gen(record(arbs));
}

/** `Gen.tuple(a, b, c)` helper — variadic tuple. */
export function genTuple<T extends readonly unknown[]>(
  ...gens: { [K in keyof T]: Gen<T[K]> }
): Gen<T> {
  const arbs = gens.map((g) => g.arbitrary);
  // `tuple` is variadic-generic over an array type; our mapped arbs
  // lose the tuple arity at the callsite — cast the result back to T.
  const arb = tuple(...(arbs as { [K in keyof T]: Arbitrary<T[K]> }));
  return new Gen<T>(arb as unknown as Arbitrary<T>);
}
