/**
 * API Versioning — Negotiation Router + Fallback Chain
 *
 * The orchestrator: takes a request, extracts the requested version,
 * resolves it against the VersionMatrix, and produces a routing decision:
 *
 *   requested    extracted     resolved        decision
 *   ─────────    ─────────     ─────────       ─────────
 *   "v2"    ──►  "2"     ──►   matrix ──►      route + headers
 *   none    ──►  (default)     fallback        route latest, mark implicit
 *   "v9"    ──►  "9"     ──►   unknown   ──►   fallback chain or 404-ish
 *   "v1"    ──►  "1"     ──►   sunset    ──►   REJECT (410 semantics)
 *
 * Fallback chains are per-version ordered lists: `v3 → [v2, v1]` means "if
 * v3 isn't available, try v2 then v1". A request that lands on a fallback
 * gets `X-API-Version-Fallback: requested → served` so clients can observe
 * the downgrade.
 *
 * @module ApiVersioning/Negotiation
 */

import { VersionMatrix, VersionClock, VersionResolution } from './VersionMatrix';
import { VersionedRequest, VersionExtractor, CompositeVersionExtractor, ExtractionResult } from './VersionExtractor';
import { deprecationHeaders, betaHeaders, mergeHeaders } from './DeprecationHeaders';
import { SemVer } from './SemVer';

export interface RoutingDecision {
  /** The version the request will actually be served by. */
  readonly version: string;
  /** What the client asked for (undefined = implicit/default). */
  readonly requestedVersion: string | undefined;
  readonly extraction: ExtractionResult | undefined;
  readonly resolution: VersionResolution;
  /** Reject the request (sunset passed / unknown + strict). */
  readonly reject: boolean;
  readonly rejectReason?: string;
  /** True when served by a fallback, not the requested version. */
  readonly fellBack: boolean;
  /** Response headers to attach (deprecation/beta/fallback notices). */
  readonly headers: Record<string, string>;
  /** Migration guide URL when known. */
  readonly migrationGuideUrl?: string;
}

export interface VersionRouterOptions {
  /** Version assumed when the request doesn't specify one. Default = matrix.latest(). */
  readonly defaultVersion?: string;
  /** Per-version ordered fallbacks: version → [candidates]. */
  readonly fallbacks?: Readonly<Record<string, ReadonlyArray<string>>>;
  /**
   * When a requested version is unknown to the matrix:
   *  - 'fallback' (default): walk the fallback chain, then default version.
   *  - 'reject': routing decision rejects (caller renders 400/404).
   */
  readonly unknownPolicy?: 'fallback' | 'reject';
  readonly extractor?: VersionExtractor;
  readonly clock?: VersionClock;
}

export class VersionRouter {
  private readonly _matrix: VersionMatrix;
  private readonly _extractor: VersionExtractor;
  private readonly _defaultVersion: string | undefined;
  private readonly _fallbacks: Readonly<Record<string, ReadonlyArray<string>>>;
  private readonly _unknownPolicy: 'fallback' | 'reject';
  private readonly _clock: VersionClock;

  constructor(matrix: VersionMatrix, options: VersionRouterOptions = {}) {
    this._matrix = matrix;
    this._extractor = options.extractor ?? new CompositeVersionExtractor();
    this._defaultVersion = options.defaultVersion;
    this._fallbacks = options.fallbacks ?? {};
    this._unknownPolicy = options.unknownPolicy ?? 'fallback';
    this._clock = options.clock ?? Date.now;
  }

  get matrix(): VersionMatrix {
    return this._matrix;
  }

  /** Route one request. */
  route(req: VersionedRequest): RoutingDecision {
    const now = this._clock();
    const extraction = this._extractor.extract(req);
    const requested = extraction?.version;
    const effective = requested ?? this._defaultVersion ?? this._matrix.latest(now);

    if (effective === undefined) {
      return {
        version: '',
        requestedVersion: requested,
        extraction,
        resolution: { version: '', lifecycle: 'unknown', entry: undefined, sunset: false },
        reject: true,
        rejectReason: 'no version requested and no default available',
        fellBack: false,
        headers: {},
      };
    }

    // An explicitly requested version that is already sunset is rejected
    // outright — falling back silently would hide the 410 the client needs
    // to see. Only *implicit* (default) sunset versions walk the chain.
    const requestedRes = requested !== undefined ? this._matrix.resolve(effective, now) : undefined;
    if (requestedRes?.sunset === true) {
      return this._reject(effective, requested, extraction, requestedRes, `API version '${effective}' was sunset on ${new Date(requestedRes.entry?.sunsetAt ?? 0).toISOString()}`);
    }

    // Walk the fallback chain from the effective version.
    const chain = this._candidateChain(effective);
    for (const candidate of chain) {
      const res = this._matrix.resolve(candidate, now);
      if (res.sunset) {
        // Sunset versions are not fallback targets — keep walking.
        continue;
      }
      if (res.lifecycle === 'unknown') {
        if (this._unknownPolicy === 'reject' && candidate === effective) {
          return this._reject(candidate, requested, extraction, res, `unknown API version '${candidate}'`);
        }
        continue;
      }
      // Served by `candidate`.
      const fellBack = candidate !== effective;
      const headers: Record<string, string> = { 'X-API-Version': candidate };
      if (fellBack) {
        headers['X-API-Version-Fallback'] = `${requested ?? 'default'} → ${candidate}`;
      }
      if (res.lifecycle === 'deprecated' || res.lifecycle === 'sunset-pending') {
        Object.assign(headers, mergeHeaders(deprecationHeaders(res.entry as NonNullable<typeof res.entry>, req.path)));
      } else if (res.lifecycle === 'beta') {
        Object.assign(headers, betaHeaders(candidate).headers);
      }
      const decision: RoutingDecision = {
        version: candidate,
        requestedVersion: requested,
        extraction,
        resolution: res,
        reject: false,
        fellBack,
        headers,
        ...(res.entry?.migrationGuideUrl !== undefined ? { migrationGuideUrl: res.entry.migrationGuideUrl } : {}),
      };
      return decision;
    }

    // Nothing servable in the chain. If the original request was sunset,
    // report that specifically (410 semantics) rather than generic unknown.
    const origRes = this._matrix.resolve(effective, now);
    if (origRes.sunset) {
      return this._reject(effective, requested, extraction, origRes, `API version '${effective}' was sunset on ${new Date(origRes.entry?.sunsetAt ?? 0).toISOString()}`);
    }
    return this._reject(effective, requested, extraction, origRes, `API version '${effective}' is not available`);
  }

  /**
   * Ordered candidates for `version`: itself, then its declared fallbacks,
   * then (for unknown versions) the matrix default. Cycles are cut by the
   * visited-set so a misconfigured `a→b→a` can't loop.
   */
  private _candidateChain(version: string): string[] {
    const out: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [version];
    while (queue.length > 0) {
      const v = queue.shift() as string;
      if (visited.has(v)) continue;
      visited.add(v);
      out.push(v);
      for (const f of this._fallbacks[v] ?? []) queue.push(f);
    }
    // Last resort: configured default / matrix latest (only if not already tried).
    const lastResort = this._defaultVersion ?? this._matrix.latest();
    if (lastResort !== undefined && !visited.has(lastResort)) out.push(lastResort);
    return out;
  }

  private _reject(
    version: string,
    requested: string | undefined,
    extraction: ExtractionResult | undefined,
    res: VersionResolution,
    reason: string
  ): RoutingDecision {
    const headers: Record<string, string> = {};
    if (res.entry?.sunsetAt !== undefined) {
      headers['Sunset'] = new Date(res.entry.sunsetAt).toUTCString();
    }
    return {
      version,
      requestedVersion: requested,
      extraction,
      resolution: res,
      reject: true,
      rejectReason: reason,
      fellBack: false,
      headers,
      ...(res.entry?.migrationGuideUrl !== undefined ? { migrationGuideUrl: res.entry.migrationGuideUrl } : {}),
    };
  }

  /**
   * Suggest the closest known version to `requested` — for 400 responses:
   * "did you mean v2?". Distance = smallest semver diff among same-major
   * versions, else latest.
   */
  suggest(requested: string): string | undefined {
    let sv: SemVer | null = null;
    try {
      sv = SemVer.coerce(requested) ?? SemVer.parse(requested);
    } catch {
      sv = null;
    }
    const known = this._matrix.versions();
    if (known.length === 0) return undefined;
    if (sv === null) return this._matrix.latest();
    const sameMajor = known.filter((k) => {
      try {
        return (SemVer.coerce(k) ?? SemVer.parse(k)).major === sv.major;
      } catch {
        return false;
      }
    });
    if (sameMajor.length === 0) return this._matrix.latest();
    sameMajor.sort((a, b) => {
      const av = SemVer.coerce(a) ?? SemVer.parse(a);
      const bv = SemVer.coerce(b) ?? SemVer.parse(b);
      return Math.abs(av.compare(sv)) - Math.abs(bv.compare(sv));
    });
    return sameMajor[0];
  }
}
