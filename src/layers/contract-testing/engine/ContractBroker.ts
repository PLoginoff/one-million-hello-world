/**
 * ContractBroker
 *
 * Pact-format serialization, a consumer-side mock provider, and
 * verification bookkeeping.
 *
 *  - {@link ContractSerializer}: converts {@link Contract} documents
 *    to/from a Pact-compatible JSON shape ({ consumer, provider,
 *    interactions[], matchingRules, metadata }) — the wire format a
 *    real pact broker stores.
 *  - {@link MockProvider}: stands up the contract for consumer tests —
 *    receives an actual {@link ContractRequest}, finds the best-matching
 *    interaction (method + path pattern + provider state), verifies the
 *    request against the interaction's request expectations, and
 *    returns the stubbed response. Unmatched requests produce a
 *    detailed miss report, mirroring Pact's mock server.
 *  - {@link VerificationStore}: records verification outcomes (the
 *    "can-i-deploy" ledger) and computes deployment eligibility.
 *
 * @module ContractTesting/Engine
 */

import {
  Json,
  MatchingRule,
  MatcherSet,
  MatchMismatch,
  matchValue,
  isJson,
} from './ContractMatchers';
import {
  Contract,
  ContractInteraction,
  ContractRequest,
  ContractResponse,
  HttpMethod,
  Semver,
  parseSemver,
  formatSemver,
} from './ContractRegistry';

/* ------------------------------------------------------------------------ */
/* Pact-format serialization                                                */
/* ------------------------------------------------------------------------ */

/**
 * Serialized pact document — the shape pact brokers persist.
 * Matching rules are grouped per pact-spec section
 * (`$.body.…`, `$.headers.…`, `$.query.…`).
 */
export interface PactDocument {
  readonly consumer: { name: string };
  readonly provider: { name: string };
  readonly interactions: readonly PactInteraction[];
  readonly metadata: {
    readonly pactSpecification: { version: string };
    readonly contractVersion: string;
  };
}

export interface PactInteraction {
  readonly description: string;
  readonly providerState?: string;
  readonly request: {
    readonly method: string;
    readonly path: string;
    readonly headers?: Record<string, string>;
    readonly query?: Record<string, string>;
    readonly body?: Json;
  };
  readonly response: {
    readonly status: number;
    readonly headers?: Record<string, string>;
    readonly body?: Json;
  };
  readonly matchingRules?: Record<string, Record<string, MatchingRule[]>>;
}

/** Serialize a contract to the pact JSON document. */
export function toPactDocument(contract: Contract): PactDocument {
  return {
    consumer: { name: contract.consumer },
    provider: { name: contract.provider },
    metadata: {
      pactSpecification: { version: '2.0.0' },
      contractVersion: formatSemver(contract.version),
    },
    interactions: contract.interactions.map((i) => ({
      description: i.description,
      providerState: i.providerState,
      request: {
        method: i.request.method,
        path: i.request.path,
        headers: i.request.headers ? { ...i.request.headers } : undefined,
        query: i.request.query ? { ...i.request.query } : undefined,
        body: i.request.body,
      },
      response: {
        status: i.response.status,
        headers: i.response.headers ? { ...i.response.headers } : undefined,
        body: i.response.body,
      },
      matchingRules: groupRules([
        ...contract.matchingRules,
        ...(i.matchingRules ?? []),
      ]),
    })),
  };
}

/** Group rules by pact section (body / headers / query / path). */
function groupRules(
  rules: readonly MatchingRule[]
): Record<string, Record<string, MatchingRule[]>> | undefined {
  if (rules.length === 0) return undefined;
  const out: Record<string, Record<string, MatchingRule[]>> = {};
  for (const r of rules) {
    const m = /^\$\.(body|headers|query|path)(.*)$/.exec(r.path);
    const section = m ? m[1] : 'body';
    const suffix = m ? `$${m[2]}` : r.path;
    const bucket = (out[section] ??= {});
    (bucket[suffix] ??= []).push(r);
  }
  return out;
}

/** Deserialize a pact document back to a {@link Contract}. */
export function fromPactDocument(doc: PactDocument): Contract {
  const interactions: ContractInteraction[] = doc.interactions.map((pi, idx) => {
    const rules: MatchingRule[] = [];
    for (const [section, byPath] of Object.entries(pi.matchingRules ?? {})) {
      for (const [suffix, rs] of Object.entries(byPath)) {
        for (const r of rs) {
          rules.push({ ...r, path: section === 'body' ? suffix : `$.${section}${suffix.slice(1)}` });
        }
      }
    }
    return {
      id: `interaction-${idx + 1}`,
      description: pi.description,
      providerState: pi.providerState,
      request: {
        method: pi.request.method.toUpperCase() as HttpMethod,
        path: pi.request.path,
        headers: pi.request.headers,
        query: pi.request.query,
        body: pi.request.body,
      },
      response: {
        status: pi.response.status,
        headers: pi.response.headers,
        body: pi.response.body,
      },
      matchingRules: rules,
    };
  });
  return {
    consumer: doc.consumer.name,
    provider: doc.provider.name,
    version: parseSemver(doc.metadata.contractVersion),
    interactions,
    matchingRules: [],
    publishedAt: 0,
    tags: [],
  };
}

/* ------------------------------------------------------------------------ */
/* Mock provider (consumer-side test double)                                */
/* ------------------------------------------------------------------------ */

/** An incoming request that missed every interaction. */
export interface MockMiss {
  readonly request: ContractRequest;
  /** Scored candidate list: best matches with their diffs. */
  readonly candidates: readonly {
    readonly interactionId: string;
    readonly description: string;
    readonly score: number;
    readonly mismatches: readonly MatchMismatch[];
  }[];
}

export interface MockHit {
  readonly interaction: ContractInteraction;
  readonly response: ContractResponse;
  readonly requestMismatches: readonly MatchMismatch[];
}

/**
 * Consumer-side mock provider: replays the contract's expected
 * responses when the consumer sends a matching request, and reports
 * near-misses otherwise.
 *
 * Matching precedence (pact semantics):
 *   1. method must equal exactly
 *   2. path pattern match: literal equality, or template paths with
 *      `:param` segments (`/users/:id`) — matched segment-for-segment
 *   3. query params present in the contract must equal
 *   4. request body must satisfy the interaction's matching rules
 *      (default: strict equality on provided body)
 *
 * The best candidate scores by fewest mismatches so callers get a
 * useful "did you mean" report.
 */
export class MockProvider {
  private readonly _requests: ContractRequest[] = [];

  constructor(private readonly _contract: Contract) {}

  /** All requests received so far. */
  get received(): readonly ContractRequest[] {
    return [...this._requests];
  }

  /** Reset the received-request ledger (between test cases). */
  reset(): void {
    this._requests.length = 0;
  }

  /**
   * Path-template matching: `/users/:id/orders/:oid` matches
   * `/users/42/orders/7`, capturing params.
   * Returns undefined when shapes differ.
   */
  static matchPathTemplate(
    pattern: string,
    actual: string
  ): Record<string, string> | undefined {
    const pSegs = pattern.split('/').filter(Boolean);
    const aSegs = actual.split('/').filter(Boolean);
    if (pSegs.length !== aSegs.length) return undefined;
    const params: Record<string, string> = {};
    for (let i = 0; i < pSegs.length; i++) {
      const p = pSegs[i];
      const a = aSegs[i];
      if (p.startsWith(':')) {
        params[p.slice(1)] = a;
      } else if (p !== a) {
        return undefined;
      }
    }
    return params;
  }

  /** Verify provider state requirement. */
  private _stateOk(i: ContractInteraction, state: string | undefined): boolean {
    return i.providerState === undefined || i.providerState === state;
  }

  /**
   * Handle an incoming request. Returns the matched hit, or a miss
   * with ranked candidates.
   */
  handle(request: ContractRequest, providerState?: string): MockHit | MockMiss {
    this._requests.push(request);
    const scored: {
      i: ContractInteraction;
      score: number;
      mismatches: MatchMismatch[];
    }[] = [];

    for (const i of this._contract.interactions) {
      if (i.request.method !== request.method) continue;
      const params = MockProvider.matchPathTemplate(i.request.path, request.path);
      if (params === undefined) continue;
      if (!this._stateOk(i, providerState)) continue;

      const mismatches: MatchMismatch[] = [];
      // query: every expected param must match
      for (const [k, v] of Object.entries(i.request.query ?? {})) {
        const got = request.query?.[k];
        if (got !== v) {
          mismatches.push({
            path: `$.query.${k}`,
            expected: v,
            actual: got ?? '<missing>',
            reason: 'query param mismatch',
          });
        }
      }
      // headers: expected headers must be present and equal
      for (const [k, v] of Object.entries(i.request.headers ?? {})) {
        const got = request.headers?.[k];
        if (got !== undefined && got !== v) {
          mismatches.push({
            path: `$.headers.${k}`,
            expected: v,
            actual: got,
            reason: 'header mismatch',
          });
        }
      }
      // body via matching rules
      if (i.request.body !== undefined) {
        const matchers = new MatcherSet([
          ...this._contract.matchingRules,
          ...(i.matchingRules ?? []),
        ]);
        const r = matchValue(i.request.body, request.body, matchers, ['body']);
        mismatches.push(...r.mismatches);
      }
      scored.push({ i, score: mismatches.length, mismatches });
    }

    if (scored.length === 0) {
      return {
        request,
        candidates: [],
      };
    }
    scored.sort((a, b) => a.score - b.score);
    const best = scored[0];
    if (best.score === 0) {
      return {
        interaction: best.i,
        response: best.i.response,
        requestMismatches: [],
      };
    }
    return {
      request,
      candidates: scored.map((s) => ({
        interactionId: s.i.id,
        description: s.i.description,
        score: s.score,
        mismatches: s.mismatches,
      })),
    };
  }

  /**
   * Verify that all interactions were exercised — pact mock-server
   * teardown check.
   */
  verifyAllInteractionsCalled(): {
    readonly complete: boolean;
    readonly missing: readonly ContractInteraction[];
  } {
    const missing = this._contract.interactions.filter(
      (i) =>
        !this._requests.some(
          (r) =>
            r.method === i.request.method &&
            MockProvider.matchPathTemplate(i.request.path, r.path) !== undefined
        )
    );
    return { complete: missing.length === 0, missing };
  }
}

/* ------------------------------------------------------------------------ */
/* Verification store — can-i-deploy ledger                                 */
/* ------------------------------------------------------------------------ */

export interface VerificationRecord {
  readonly contractConsumer: string;
  readonly contractProvider: string;
  readonly contractVersion: string;
  readonly providerVersion: string;
  readonly success: boolean;
  readonly verifiedAt: number;
  readonly failedInteractions: readonly string[];
}

/**
 * Records provider verification outcomes and answers deployability
 * questions — the in-memory analog of the pact broker's matrix.
 */
export class VerificationStore {
  private readonly _records: VerificationRecord[] = [];

  record(r: VerificationRecord): void {
    this._records.push(r);
  }

  /** Latest verification for a contract triple. */
  latest(
    consumer: string,
    provider: string,
    contractVersion: string
  ): VerificationRecord | undefined {
    for (let i = this._records.length - 1; i >= 0; i--) {
      const r = this._records[i];
      if (
        r.contractConsumer === consumer &&
        r.contractProvider === provider &&
        r.contractVersion === contractVersion
      ) {
        return r;
      }
    }
    return undefined;
  }

  /**
   * Can this contract version deploy? True when at least one successful
   * verification exists against the given provider version.
   */
  canDeploy(
    consumer: string,
    provider: string,
    contractVersion: string,
    providerVersion: string
  ): boolean {
    return this._records.some(
      (r) =>
        r.contractConsumer === consumer &&
        r.contractProvider === provider &&
        r.contractVersion === contractVersion &&
        r.providerVersion === providerVersion &&
        r.success
    );
  }

  all(): readonly VerificationRecord[] {
    return [...this._records];
  }
}

/* ------------------------------------------------------------------------ */
/* Semver utilities for contract tagging                                    */
/* ------------------------------------------------------------------------ */

/** Whether contract version `v` satisfies range constraint. */
export function versionSatisfies(
  v: Semver,
  constraint: { min?: Semver; max?: Semver; major?: number }
): boolean {
  const cmp = (a: Semver, b: Semver): number =>
    a.major !== b.major
      ? a.major - b.major
      : a.minor !== b.minor
        ? a.minor - b.minor
        : a.patch - b.patch;
  if (constraint.major !== undefined && v.major !== constraint.major) return false;
  if (constraint.min && cmp(v, constraint.min) < 0) return false;
  if (constraint.max && cmp(v, constraint.max) > 0) return false;
  return true;
}
