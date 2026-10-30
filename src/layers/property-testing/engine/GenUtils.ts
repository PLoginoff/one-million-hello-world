/**
 * GenUtils — composed generators, run statistics, counterexample DB
 *
 * Higher-level machinery on top of {@link Arbitrary}:
 *
 *  - domain generators: `email()`, `ipv4()`, `isoDate()`, `uuid()`,
 *    `ascii()`, `unicode()`, `alphaNum()` — built by composing the
 *    primitives so their shrink trees stay intact.
 *  - `sample()`: draw N values from an arbitrary (test/debug aid).
 *  - `statistics()`: collect per-run classification stats — the
 *    QuickCheck `collect`/`classify` feature for checking that
 *    generated inputs actually exercise interesting partitions.
 *  - `noShrink()`: mark an arbitrary's output as unshrinkable.
 *  - {@link CounterexampleDb}: persist minimal failing cases keyed by
 *    property name so regressions replay instantly — the in-memory
 *    analog of fast-check's `.counterexamples` artifact files.
 *
 * @module PropertyTesting/Engine
 */

import {
  Arbitrary,
  ShrinkTree,
  mulberry32,
  int,
  string,
  array,
  tuple,
  record,
  oneOf,
  constant,
  mapArbitrary,
  leaf,
} from './Arbitrary';
import { Property, PropertyReport, PropertyRunner } from './PropertyRunner';

/* ------------------------------------------------------------------------ */
/* Domain generators                                                        */
/* ------------------------------------------------------------------------ */

const ALPHA_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const ALPHA_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const ASCII_CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

/** Lowercase alpha string. */
export function alpha(opts: { minLength?: number; maxLength?: number } = {}): Arbitrary<string> {
  return string({ charset: ALPHA_LOWER, ...opts });
}

/** Alphanumeric string. */
export function alphaNum(opts: { minLength?: number; maxLength?: number } = {}): Arbitrary<string> {
  return string({ charset: ALPHA_LOWER + ALPHA_UPPER + DIGITS, ...opts });
}

/** Full printable-ASCII string. */
export function ascii(opts: { minLength?: number; maxLength?: number } = {}): Arbitrary<string> {
  return string({ charset: ASCII_CHARS, ...opts });
}

/** Unicode string — code points sampled from a broad BMP range. */
export function unicode(opts: { minLength?: number; maxLength?: number } = {}): Arbitrary<string> {
  const minLen = opts.minLength ?? 0;
  const maxLen = opts.maxLength ?? 32;
  const node = (s: string): ShrinkTree<string> => ({
    value: s,
    candidates: () => (s.length > minLen ? [node(s.slice(0, minLen))] : []),
  });
  return {
    generate(rand) {
      const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
      let s = '';
      for (let i = 0; i < len; i++) {
        // printable-ish BMP range
        s += String.fromCharCode(32 + Math.floor(rand() * 0x2000));
      }
      return node(s);
    },
  };
}

/** Email address — local@domain.tld composition. */
export function email(): Arbitrary<string> {
  return mapArbitrary(
    tuple(
      alphaNum({ minLength: 1, maxLength: 12 }),
      alphaNum({ minLength: 1, maxLength: 10 }),
      alpha({ minLength: 2, maxLength: 4 })
    ),
    ([local, domain, tld]) => `${local}@${domain}.${tld}`
  );
}

/** IPv4 address as four octets. */
export function ipv4(): Arbitrary<string> {
  const octet = int({ min: 0, max: 255 });
  return mapArbitrary(tuple(octet, octet, octet, octet), (o) => o.join('.'));
}

/** ISO date (YYYY-MM-DD) with sane ranges. */
export function isoDate(): Arbitrary<string> {
  return mapArbitrary(
    tuple(
      int({ min: 1970, max: 2100 }),
      int({ min: 1, max: 12 }),
      int({ min: 1, max: 28 })
    ),
    ([y, m, d]) =>
      `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d
        .toString()
        .padStart(2, '0')}`
  );
}

/** UUID v4-shaped string. */
export function uuid(): Arbitrary<string> {
  const hex = '0123456789abcdef';
  const seg = (n: number): Arbitrary<string> =>
    mapArbitrary(
      array(
        mapArbitrary(int({ min: 0, max: 15 }), (i) => hex[i]),
        { minLength: n, maxLength: n }
      ),
      (cs) => cs.join('')
    );
  return mapArbitrary(
    tuple(seg(8), seg(4), seg(4), seg(4), seg(12)),
    ([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`
  );
}

/* ------------------------------------------------------------------------ */
/* Shrinking control                                                        */
/* ------------------------------------------------------------------------ */

/** Wrap an arbitrary to produce no shrink candidates. */
export function noShrink<T>(arb: Arbitrary<T>): Arbitrary<T> {
  return {
    canGenerate: arb.canGenerate,
    generate: (rand) => leaf(arb.generate(rand).value),
  };
}

/** Limit shrink depth — candidates truncated at `depth` tree levels. */
export function limitShrink<T>(arb: Arbitrary<T>, depth: number): Arbitrary<T> {
  const cut = (t: ShrinkTree<T>, d: number): ShrinkTree<T> => ({
    value: t.value,
    candidates: () => (d <= 0 ? [] : t.candidates().map((c) => cut(c, d - 1))),
  });
  return {
    canGenerate: arb.canGenerate,
    generate: (rand) => cut(arb.generate(rand), depth),
  };
}

/* ------------------------------------------------------------------------ */
/* Sampling                                                                 */
/* ------------------------------------------------------------------------ */

/** Draw `n` values from an arbitrary — deterministic per seed. */
export function sample<T>(arb: Arbitrary<T>, n: number, seed = 1): readonly T[] {
  const rand = mulberry32(seed);
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arb.generate(rand).value);
  return out;
}

/** Draw `n` full shrink trees (for debugging shrink behavior). */
export function sampleTrees<T>(arb: Arbitrary<T>, n: number, seed = 1): readonly ShrinkTree<T>[] {
  const rand = mulberry32(seed);
  const out: ShrinkTree<T>[] = [];
  for (let i = 0; i < n; i++) out.push(arb.generate(rand));
  return out;
}

/* ------------------------------------------------------------------------ */
/* Statistics — QuickCheck collect/classify                                 */
/* ------------------------------------------------------------------------ */

export interface ClassifiedReport extends PropertyReport {
  /** label → share of passing cases carrying it, as [0,1]. */
  readonly distribution: ReadonlyMap<string, number>;
  /** labels below the required share (warning for biased generators). */
  readonly underrepresented: readonly string[];
}

/**
 * Run a property while classifying each drawn case into labeled
 * buckets — the `collect` combinator. Reports which buckets are
 * underrepresented (below `minShare`), flagging biased generators:
 * a property that only ever sees small arrays is not testing much.
 */
export async function checkWithStats<Args extends readonly unknown[]>(
  prop: Property<Args>,
  classify: (...args: Args) => string,
  options: { cases?: number; seed?: number; minShare?: number } = {}
): Promise<ClassifiedReport> {
  const cases = options.cases ?? 100;
  const seed = options.seed ?? 1;
  const minShare = options.minShare ?? 0.1;
  const rand = mulberry32(seed);
  const counts = new Map<string, number>();
  let run = 0;
  let failure: ClassifiedReport['failure'];

  while (run < cases) {
    const trees = prop.arbitraries.map((a) => a.generate(rand)) as {
      [K in keyof Args]: ShrinkTree<Args[K]>;
    };
    const args = trees.map((t) => t.value) as unknown as Args;
    if (prop.precondition && !prop.precondition(...args)) continue;
    run++;
    const label = classify(...args);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const ok = await (async (): Promise<boolean> => {
      try {
        const r = await prop.predicate(...args);
        return r !== false;
      } catch {
        return false;
      }
    })();
    if (!ok) {
      failure = {
        counterexample: args,
        original: args,
        caseIndex: run - 1,
        shrinkEvals: 0,
      };
      break;
    }
  }
  const distribution = new Map<string, number>();
  for (const [k, v] of counts) distribution.set(k, v / run);
  const underrepresented = [...distribution.entries()]
    .filter(([, v]) => v < minShare)
    .map(([k]) => k);
  return {
    name: prop.name,
    status: failure ? 'failed' : 'passed',
    seed,
    casesRun: run,
    casesDiscarded: 0,
    durationMs: 0,
    failure,
    distribution,
    underrepresented,
  };
}

/* ------------------------------------------------------------------------ */
/* Counterexample database                                                  */
/* ------------------------------------------------------------------------ */

export interface StoredCounterexample {
  readonly propertyName: string;
  readonly counterexample: unknown;
  readonly seed: number;
  readonly recordedAt: number;
}

/**
 * Records minimal failing inputs keyed by property. On re-runs the
 * runner can `replay()` a stored seed to instantly confirm or clear
 * a regression without re-generating cases.
 */
export class CounterexampleDb {
  private readonly _store = new Map<string, StoredCounterexample>();

  /** Record a failure report. No-op for passing runs. */
  record(report: PropertyReport): void {
    if (report.status !== 'failed' || report.failure === undefined) return;
    this._store.set(report.name, {
      propertyName: report.name,
      counterexample: report.failure.counterexample,
      seed: report.seed,
      recordedAt: Date.now(),
    });
  }

  /** Stored counterexample for a property, if any. */
  get(propertyName: string): StoredCounterexample | undefined {
    return this._store.get(propertyName);
  }

  /** All property names with stored counterexamples. */
  properties(): readonly string[] {
    return [...this._store.keys()];
  }

  /** Clear a property's record (e.g. after a fix is verified). */
  clear(propertyName: string): void {
    this._store.delete(propertyName);
  }

  /** Serialize for persistence. */
  toJSON(): readonly StoredCounterexample[] {
    return [...this._store.values()];
  }

  /** Restore from a serialized blob. */
  static fromJSON(items: readonly StoredCounterexample[]): CounterexampleDb {
    const db = new CounterexampleDb();
    for (const i of items) db._store.set(i.propertyName, i);
    return db;
  }
}

/* ------------------------------------------------------------------------ */
/* forAll combinator                                                        */
/* ------------------------------------------------------------------------ */

/**
 * `forAll(arb, pred)` — minimal fluent property helper. Unlike
 * `property()`, forAll checks inline and returns the report; intended
 * for quick assertions inside unit tests:
 *
 * ```ts
 * const r = await forAll(int(), (n) => n + 0 === n);
 * expect(r.status).toBe('passed');
 * ```
 */
export async function forAll<T>(
  arb: Arbitrary<T>,
  pred: (v: T) => boolean | void | Promise<boolean | void>,
  options: { cases?: number; seed?: number } = {}
): Promise<PropertyReport> {
  const p: Property<[T]> = {
    name: 'forAll',
    arbitraries: [arb],
    predicate: pred,
  };
  return new PropertyRunner(options).check(p, options.seed);
}
