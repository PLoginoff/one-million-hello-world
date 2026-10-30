/**
 * LearningMode — observe live traffic, suggest rules.
 *
 * Learning mode records the *shape* of requests that existing rules
 * flagged (or that an operator marked suspicious) and generalizes them
 * into DSL rule suggestions:
 *
 *  - Repeated attacks on a path → `path == "X" and …` suggestions.
 *  - A header value that always accompanies flagged traffic →
 *    `header.x == "v"` clause.
 *  - A query param carrying recurring payload fragments →
 *    `query.p contains "frag"`.
 *
 * Generalization is conservative: a signal must appear in ≥
 * `minObservations` flagged requests AND in ≥ `supportRatio` of all
 * flagged requests for that path family before it's promoted — this
 * avoids baking one-off noise into rules.
 *
 * All structures are maps keyed by path-family (first path segment) so
 * memory stays bounded by route count, not request count.
 *
 * Complexity: observation is O(headers+params); suggestion generation is
 * O(observations) run on demand, not per request.
 *
 * @module WafLayer/Engine2
 */

import { WafRequest2, WafClock2, SystemWafClock2 } from './types';

export interface LearningModeOptions {
  /** Observations needed before a signal can be promoted. Default 5. */
  minObservations?: number;
  /** Fraction of flagged requests that must share the signal. Default 0.6. */
  supportRatio?: number;
  /** Max header/query values tracked per family (cardinality cap). */
  maxValuesPerSignal?: number;
  clock?: WafClock2;
}

export interface RuleSuggestion {
  /** Proposed DSL expression. */
  readonly expression: string;
  /** Confidence in [0,1] = supporting fraction of flagged requests. */
  readonly confidence: number;
  /** How many flagged requests carried this signal. */
  readonly support: number;
  /** Human-readable rationale. */
  readonly rationale: string;
}

interface SignalCounters {
  /** path-prefix family flagged request count. */
  flaggedTotal: number;
  /** header name → Map<value, count> */
  headerValues: Map<string, Map<string, number>>;
  /** query param → Map<value, count> */
  queryValues: Map<string, Map<string, number>>;
  /** suspicious body fragments → count */
  bodyFragments: Map<string, number>;
  /** methods seen in flagged traffic */
  methods: Map<string, number>;
  /** countries seen */
  countries: Map<string, number>;
}

export class LearningMode {
  private readonly _minObs: number;
  private readonly _ratio: number;
  private readonly _maxValues: number;
  private readonly _clock: WafClock2;
  /** path family → signal counters */
  private readonly _families = new Map<string, SignalCounters>();
  private _observed = 0;
  private _flagged = 0;

  constructor(opts: LearningModeOptions = {}) {
    this._minObs = Math.max(1, opts.minObservations ?? 5);
    this._ratio = opts.supportRatio ?? 0.6;
    this._maxValues = Math.max(4, opts.maxValuesPerSignal ?? 32);
    this._clock = opts.clock ?? new SystemWafClock2();
  }

  /** Record a benign (passed) request — used only for denominators. */
  observeBenign(_req: WafRequest2): void {
    this._observed++;
  }

  /**
   * Record a flagged request — an attack or FP candidate. Signals are
   * extracted into the request's path family.
   */
  observeFlagged(req: WafRequest2, bodyFragment?: string): void {
    this._observed++;
    this._flagged++;
    const fam = this._familyOf(req.path);
    const c = this._counters(fam);
    c.flaggedTotal++;

    for (const [name, value] of Object.entries(req.headers)) {
      this._bumpNested(c.headerValues, name, value);
    }
    for (const [name, value] of Object.entries(req.query)) {
      this._bumpNested(c.queryValues, name, value);
    }
    this._bump(c.methods, req.method.toUpperCase());
    if (req.country) this._bump(c.countries, req.country.toUpperCase());
    if (bodyFragment && req.body?.includes(bodyFragment)) {
      this._bump(c.bodyFragments, bodyFragment);
    }
  }

  /**
   * Generate DSL rule suggestions for one path family (or all when
   * family is undefined).
   */
  suggest(family?: string): RuleSuggestion[] {
    const out: RuleSuggestion[] = [];
    const families = family ? [family] : [...this._families.keys()];
    for (const fam of families) {
      const c = this._families.get(fam);
      if (!c || c.flaggedTotal < this._minObs) continue;
      out.push(...this._suggestForFamily(fam, c));
    }
    // Highest-confidence first.
    return out.sort((a, b) => b.confidence - a.confidence);
  }

  /** Drop observations older than… — learning tables are count-based
   *  (no timestamps), so reset is the decay mechanism. */
  reset(family?: string): void {
    if (family) this._families.delete(family);
    else this._families.clear();
  }

  get stats(): { observed: number; flagged: number; families: number } {
    return { observed: this._observed, flagged: this._flagged, families: this._families.size };
  }

  /* ---------------------------------------------------------------- */

  private _suggestForFamily(family: string, c: SignalCounters): RuleSuggestion[] {
    const out: RuleSuggestion[] = [];
    const pathClause = `path startsWith "${family}"`;
    const total = c.flaggedTotal;

    const promote = (clause: string, support: number, rationale: string): void => {
      const confidence = support / total;
      if (support >= this._minObs && confidence >= this._ratio) {
        // Every suggestion is scoped to the path family it learned from.
        out.push({
          expression: `${pathClause} and ${clause}`,
          confidence,
          support,
          rationale,
        });
      }
    };

    for (const [header, values] of c.headerValues) {
      for (const [value, count] of values) {
        promote(`header.${header} == "${value}"`, count, `header ${header}=${value} in ${count}/${total} flagged`);
      }
    }
    for (const [param, values] of c.queryValues) {
      for (const [value, count] of values) {
        promote(`query.${param} contains "${value}"`, count, `query ${param}~${value} in ${count}/${total} flagged`);
      }
    }
    for (const [frag, count] of c.bodyFragments) {
      promote(`body contains "${frag}"`, count, `body fragment '${frag}' in ${count}/${total} flagged`);
    }
    for (const [m, count] of c.methods) {
      promote(`method == "${m}"`, count, `method ${m} in ${count}/${total} flagged`);
    }
    for (const [cc, count] of c.countries) {
      promote(`country == "${cc}"`, count, `country ${cc} in ${count}/${total} flagged`);
    }
    return out;
  }

  private _familyOf(path: string): string {
    // First path segment is the "family": /admin/users → /admin
    const idx = path.indexOf('/', 1);
    return idx === -1 ? path : path.slice(0, idx);
  }

  private _counters(fam: string): SignalCounters {
    let c = this._families.get(fam);
    if (!c) {
      c = {
        flaggedTotal: 0,
        headerValues: new Map(),
        queryValues: new Map(),
        bodyFragments: new Map(),
        methods: new Map(),
        countries: new Map(),
      };
      this._families.set(fam, c);
    }
    return c;
  }

  private _bump(map: Map<string, number>, key: string): void {
    if (!map.has(key) && map.size >= this._maxValues) return; // cardinality cap
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  private _bumpNested(outer: Map<string, Map<string, number>>, name: string, value: string): void {
    let inner = outer.get(name);
    if (!inner) {
      inner = new Map();
      outer.set(name, inner);
    }
    this._bump(inner, value);
  }
}
