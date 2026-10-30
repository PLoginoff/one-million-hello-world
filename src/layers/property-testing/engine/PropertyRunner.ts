/**
 * PropertyRunner — property check loop with shrinking
 *
 * The QuickCheck check loop:
 *   1. draw N cases from the arbitraries (seeded)
 *   2. run the predicate; on failure, shrink the failing case to a
 *      local minimum and report it
 *   3. count "discards" when a precondition rejects a drawn case —
 *      giving up after maxDiscards to avoid infinite precondition loops
 *
 * Reports carry the seed so any failure is perfectly reproducible:
 * `seed:42` + same property + same arbitraries ⇒ identical counterexample.
 *
 * Also includes {@link forAll}-style helpers and built-in property
 * templates (roundtrip, invariant, idempotence, commutativity,
 * associativity).
 *
 * @module PropertyTesting/Engine
 */

import {
  Arbitrary,
  ShrinkTree,
  mulberry32,
  deriveSeed,
  shrinkToMinimal,
} from './Arbitrary';

/* ------------------------------------------------------------------------ */
/* Results                                                                  */
/* ------------------------------------------------------------------------ */

export type PropertyStatus = 'passed' | 'failed' | 'exhausted';

export interface PropertyFailure<T = unknown> {
  /** The smallest failing value found. */
  readonly counterexample: T;
  /** The original (pre-shrink) failing value. */
  readonly original: T;
  /** Error thrown by the property, when it threw. */
  readonly error?: unknown;
  /** Case index that first failed. */
  readonly caseIndex: number;
  /** Number of shrink evaluations performed. */
  readonly shrinkEvals: number;
}

export interface PropertyReport {
  readonly name: string;
  readonly status: PropertyStatus;
  readonly seed: number;
  readonly casesRun: number;
  readonly casesDiscarded: number;
  readonly durationMs: number;
  readonly failure?: PropertyFailure;
}

export interface PropertyOptions {
  /** Number of cases to attempt (default 100). */
  readonly cases?: number;
  /** Seed for reproducibility (default: derived from time). */
  readonly seed?: number;
  /** Max discarded (precondition-failed) cases before 'exhausted'. */
  readonly maxDiscards?: number;
  /** Cap on shrink evaluations. */
  readonly maxShrinkEvals?: number;
  /** Optional size controller 0..1 fed to arbitraries (default 0.5). */
  readonly size?: number;
}

/* ------------------------------------------------------------------------ */
/* Property                                                                 */
/* ------------------------------------------------------------------------ */

/** Predicate signature — sync or async, may throw. */
export type PropertyPredicate<Args extends readonly unknown[]> = (
  ...args: Args
) => boolean | void | Promise<boolean | void>;

/** A named property: arbitraries + predicate. */
export interface Property<Args extends readonly unknown[]> {
  readonly name: string;
  readonly arbitraries: { [K in keyof Args]: Arbitrary<Args[K]> };
  readonly predicate: PropertyPredicate<Args>;
  /** Optional precondition: false ⇒ discard the case and redraw. */
  readonly precondition?: (...args: Args) => boolean;
}

/** Builder-style property definition. */
export function property<Args extends readonly unknown[]>(
  name: string,
  arbitraries: { [K in keyof Args]: Arbitrary<Args[K]> },
  predicate: PropertyPredicate<Args>,
  precondition?: (...args: Args) => boolean
): Property<Args> {
  return { name, arbitraries, predicate, precondition };
}

/* ------------------------------------------------------------------------ */
/* Runner                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Runs a property against N random cases, then shrinks the first
 * counterexample to a minimum.
 *
 * Case evaluation semantics:
 *  - predicate returns `false` or throws ⇒ counterexample
 *  - returns `true`/`undefined` ⇒ pass
 *  - precondition `false` ⇒ discard (does not count as a run)
 */
export class PropertyRunner {
  private readonly _cases: number;
  private readonly _maxDiscards: number;
  private readonly _maxShrinkEvals: number;

  constructor(options: PropertyOptions = {}) {
    this._cases = options.cases ?? 100;
    this._maxDiscards = options.maxDiscards ?? this._cases * 5;
    this._maxShrinkEvals = options.maxShrinkEvals ?? 10_000;
  }

  /**
   * Check a property. `seed` makes the run reproducible — same seed +
   * same arbitraries ⇒ identical sequence of cases.
   */
  async check<Args extends readonly unknown[]>(
    prop: Property<Args>,
    seed?: number
  ): Promise<PropertyReport> {
    const started = Date.now();
    const runSeed = seed ?? (Date.now() % 0xffffffff);
    const rand = mulberry32(runSeed);

    let run = 0;
    let discarded = 0;
    while (run < this._cases) {
      // Each case draws trees for each arg position.
      const trees = prop.arbitraries.map((a) => a.generate(rand)) as {
        [K in keyof Args]: ShrinkTree<Args[K]>;
      };
      const args = trees.map((t) => t.value) as unknown as Args;

      if (prop.precondition && !prop.precondition(...args)) {
        discarded++;
        if (discarded >= this._maxDiscards) {
          return {
            name: prop.name,
            status: 'exhausted',
            seed: runSeed,
            casesRun: run,
            casesDiscarded: discarded,
            durationMs: Date.now() - started,
          };
        }
        continue;
      }

      run++;
      const verdict = await this._invoke(prop, args);
      if (!verdict.ok) {
        // shrink — the "fails" predicate re-runs the property
        const fails = (v: Args): boolean => {
          if (prop.precondition && !prop.precondition(...v)) return false;
          const r = this._invokeSync(prop, v);
          return !r.ok;
        };
        const tupleTree = this._tupleTree(trees);
        const { value: minimal, evals } = this._shrink(tupleTree, fails);
        return {
          name: prop.name,
          status: 'failed',
          seed: runSeed,
          casesRun: run,
          casesDiscarded: discarded,
          durationMs: Date.now() - started,
          failure: {
            counterexample: minimal.length === 1 ? minimal[0] : minimal,
            original: args.length === 1 ? args[0] : args,
            error: verdict.error,
            caseIndex: run - 1,
            shrinkEvals: evals,
          },
        };
      }
    }
    return {
      name: prop.name,
      status: 'passed',
      seed: runSeed,
      casesRun: run,
      casesDiscarded: discarded,
      durationMs: Date.now() - started,
    };
  }

  private async _invoke<Args extends readonly unknown[]>(
    prop: Property<Args>,
    args: Args
  ): Promise<{ ok: boolean; error?: unknown }> {
    try {
      const r = await prop.predicate(...args);
      return { ok: r !== false };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  private _invokeSync<Args extends readonly unknown[]>(
    prop: Property<Args>,
    args: Args
  ): { ok: boolean; error?: unknown } {
    try {
      const r = prop.predicate(...args);
      if (r instanceof Promise) {
        // shrink path is sync — unresolved promises count as pass so we
        // don't corrupt shrinking; original failure was captured async.
        return { ok: true };
      }
      return { ok: r !== false };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  /** Combine per-arg trees into a single tuple tree for shrinking. */
  private _tupleTree<Args extends readonly unknown[]>(
    trees: { [K in keyof Args]: ShrinkTree<Args[K]> }
  ): ShrinkTree<Args> {
    const node = (ts: readonly ShrinkTree<unknown>[]): ShrinkTree<Args> => ({
      value: ts.map((t) => t.value) as unknown as Args,
      candidates: () => {
        const out: ShrinkTree<Args>[] = [];
        for (let i = 0; i < ts.length; i++) {
          for (const c of ts[i].candidates()) {
            const next = [...ts];
            next[i] = c;
            out.push(node(next));
          }
        }
        return out;
      },
    });
    return node(trees);
  }

  private _shrink<Args extends readonly unknown[]>(
    tree: ShrinkTree<Args>,
    fails: (v: Args) => boolean
  ): { value: Args; evals: number } {
    return shrinkToMinimal(tree, fails, this._maxShrinkEvals);
  }
}

/* ------------------------------------------------------------------------ */
/* Convenience runner                                                       */
/* ------------------------------------------------------------------------ */

/**
 * One-shot check a property; returns the report. Throws an Error with
 * the counterexample + seed when the property fails — designed so
 * `expect(() => checkSync(p)).not.toThrow()` reads naturally in tests.
 */
export async function checkProperty<Args extends readonly unknown[]>(
  prop: Property<Args>,
  options: PropertyOptions = {}
): Promise<PropertyReport> {
  const runner = new PropertyRunner(options);
  const report = await runner.check(prop, options.seed);
  if (report.status === 'failed') {
    const ce = JSON.stringify(report.failure?.counterexample);
    const err = new Error(
      `property "${prop.name}" falsified after ${report.casesRun} cases ` +
        `(seed ${report.seed})\ncounterexample: ${ce}`
    );
    (err as { report?: PropertyReport }).report = report;
    throw err;
  }
  return report;
}

/* ------------------------------------------------------------------------ */
/* Built-in property templates                                              */
/* ------------------------------------------------------------------------ */

/**
 * Roundtrip property: `deserialize(serialize(x))` deep-equals `x`.
 * Works for any codec pair.
 */
export function roundtripProperty<T>(
  name: string,
  arb: Arbitrary<T>,
  serialize: (v: T) => unknown,
  deserialize: (s: unknown) => T,
  equal: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Property<[T]> {
  return property(name, [arb] as [Arbitrary<T>], (v) => {
    const back = deserialize(serialize(v));
    if (!equal(v, back)) {
      throw new Error(
        `roundtrip mismatch: ${JSON.stringify(v)} -> ${JSON.stringify(back)}`
      );
    }
    return true;
  });
}

/**
 * Invariant property: after applying `transform`, `invariant` still
 * holds on the value.
 */
export function invariantProperty<T>(
  name: string,
  arb: Arbitrary<T>,
  transform: (v: T) => T,
  invariant: (v: T) => boolean,
  description = 'invariant violated'
): Property<[T]> {
  return property(name, [arb] as [Arbitrary<T>], (v) => {
    const out = transform(v);
    if (!invariant(out)) {
      throw new Error(`${description}: ${JSON.stringify(out)}`);
    }
    return true;
  });
}

/**
 * Idempotence property: `f(f(x)) === f(x)` — sort, dedupe, normalize.
 */
export function idempotenceProperty<T>(
  name: string,
  arb: Arbitrary<T>,
  f: (v: T) => T,
  equal: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Property<[T]> {
  return property(name, [arb] as [Arbitrary<T>], (v) => {
    const once = f(v);
    const twice = f(once);
    if (!equal(once, twice)) {
      throw new Error(
        `not idempotent: f(${JSON.stringify(v)}) = ${JSON.stringify(once)}, f² = ${JSON.stringify(twice)}`
      );
    }
    return true;
  });
}

/** Commutativity: f(a,b) === f(b,a). */
export function commutativeProperty<A, B>(
  name: string,
  arbA: Arbitrary<A>,
  arbB: Arbitrary<B>,
  f: (a: A, b: B) => unknown,
  equal: (x: unknown, y: unknown) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Property<[A, B]> {
  return property(name, [arbA, arbB] as [Arbitrary<A>, Arbitrary<B>], (a, b) =>
    // commutativity is checked symmetrically by swapping roles
    equal(f(a, b), f(b as unknown as A, a as unknown as B))
  );
}

/** Associativity: f(f(a,b),c) === f(a,f(b,c)). */
export function associativeProperty<T>(
  name: string,
  arb: Arbitrary<T>,
  f: (a: T, b: T) => T,
  equal: (x: T, y: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Property<[T, T, T]> {
  return property(
    name,
    [arb, arb, arb] as [Arbitrary<T>, Arbitrary<T>, Arbitrary<T>],
    (a, b, c) => equal(f(f(a, b), c), f(a, f(b, c)))
  );
}

/* ------------------------------------------------------------------------ */
/* Deterministic seed helpers                                               */
/* ------------------------------------------------------------------------ */

/** Replay a failure: re-run the same property under a recorded seed. */
export async function replay<Args extends readonly unknown[]>(
  prop: Property<Args>,
  seed: number,
  options: PropertyOptions = {}
): Promise<PropertyReport> {
  return new PropertyRunner(options).check(prop, seed);
}

/** Derive per-suite seeds from a master seed — keeps CI deterministic. */
export function suiteSeed(master: number, name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return deriveSeed(master, h >>> 0);
}
