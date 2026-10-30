/**
 * ContractRegistry
 *
 * In-memory contract store ("pact broker" analog) plus provider-side
 * verification against registered interactions.
 *
 * Concepts:
 *  - {@link ContractInteraction}: a consumer expectation — "when the
 *    provider receives request X while in state S, it responds Y".
 *  - {@link Contract}: an immutable, versioned document grouping the
 *    interactions of one consumer/provider pair, plus matching rules.
 *  - {@link ContractRegistry}: publish / fetch / discover / tag contracts;
 *    maintains a matrix of (consumer, provider, version) triples.
 *  - {@link ProviderVerifier}: replays every interaction against a
 *    pluggable provider handler and reports per-interaction results.
 *
 * Storage is O(#contracts); lookups by (consumer, provider, version) are
 * O(1) via a composite-key map.
 *
 * @module ContractTesting/Engine
 */

import {
  Json,
  MatchingRule,
  MatcherSet,
  MatchMismatch,
  matchValue,
  structuralDiff,
  formatDiff,
} from './ContractMatchers';

/* ------------------------------------------------------------------------ */
/* Contract model                                                           */
/* ------------------------------------------------------------------------ */

/** HTTP-method-like verbs understood by the registry. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Expected or actual request side of an interaction. */
export interface ContractRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: Json;
}

/** Expected response side of an interaction. */
export interface ContractResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Json;
}

/** A single consumer-driven interaction. */
export interface ContractInteraction {
  readonly id: string;
  /** Human description: "a request for user 42". */
  readonly description: string;
  /** Provider state name required before the request is replayed. */
  readonly providerState?: string;
  readonly request: ContractRequest;
  readonly response: ContractResponse;
  /** Matching rules scoped to this interaction. */
  readonly matchingRules?: readonly MatchingRule[];
}

/** Semantic version triple. */
export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** Immutable, versioned contract document. */
export interface Contract {
  readonly consumer: string;
  readonly provider: string;
  readonly version: Semver;
  readonly interactions: readonly ContractInteraction[];
  /** Global matching rules applied to every interaction. */
  readonly matchingRules: readonly MatchingRule[];
  readonly publishedAt: number;
  readonly tags: readonly string[];
}

/** Options accepted by {@link ContractRegistry.publish}. */
export interface PublishOptions {
  readonly tags?: readonly string[];
  /** Wall-clock ms timestamp; defaults to Date.now(). */
  readonly publishedAt?: number;
  /** Overwrite an identical (consumer, provider, version) triple. */
  readonly overwrite?: boolean;
}

/* ------------------------------------------------------------------------ */
/* Semver helpers                                                           */
/* ------------------------------------------------------------------------ */

/** Parse "1.2.3" (pre-release/build suffixes tolerated, ignored). */
export function parseSemver(text: string): Semver {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim());
  if (!m) {
    throw new Error(`invalid semver: "${text}"`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Render a semver triple as "major.minor.patch". */
export function formatSemver(v: Semver): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Compare semvers: -1 | 0 | 1. */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/* ------------------------------------------------------------------------ */
/* Contract builder                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Fluent builder producing immutable {@link Contract} documents.
 *
 * ```ts
 * const contract = new ContractBuilder('orders-web', 'orders-api')
 *   .version('1.0.0')
 *   .interaction({
 *     description: 'get order 42',
 *     providerState: 'order 42 exists',
 *     request: { method: 'GET', path: '/orders/42' },
 *     response: { status: 200, body: { id: 42, total: 9.99 } },
 *     matchingRules: [{ path: '$.body.id', matcher: 'integer' }],
 *   })
 *   .build();
 * ```
 */
export class ContractBuilder {
  private _version: Semver = { major: 0, minor: 1, patch: 0 };
  private readonly _interactions: ContractInteraction[] = [];
  private readonly _rules: MatchingRule[] = [];
  private _seq = 0;

  constructor(
    private readonly _consumer: string,
    private readonly _provider: string
  ) {}

  /** Set contract version from a string or triple. */
  version(v: string | Semver): this {
    this._version = typeof v === 'string' ? parseSemver(v) : v;
    return this;
  }

  /** Add an interaction; `id` is auto-assigned when omitted. */
  interaction(i: Omit<ContractInteraction, 'id'> & { id?: string }): this {
    this._interactions.push({ ...i, id: i.id ?? `interaction-${++this._seq}` });
    return this;
  }

  /** Add a global matching rule. */
  matchingRule(rule: MatchingRule): this {
    this._rules.push(rule);
    return this;
  }

  /** Materialize the immutable contract document. */
  build(publishedAt = 0): Contract {
    return {
      consumer: this._consumer,
      provider: this._provider,
      version: this._version,
      interactions: [...this._interactions],
      matchingRules: [...this._rules],
      publishedAt,
      tags: [],
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Registry                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * In-memory contract broker.
 *
 * Maintains:
 *  - `byKey`: composite map consumer→provider→version→contract, O(1) fetch.
 *  - `byTag`: tag→keys index for discovery queries.
 */
export class ContractRegistry {
  private readonly _contracts = new Map<string, Map<string, Map<string, Contract>>>();
  private readonly _byTag = new Map<string, Set<string>>();
  private _published = 0;

  /** Publish a contract. Throws on duplicate unless `overwrite`. */
  publish(contract: Contract, options: PublishOptions = {}): Contract {
    const vKey = formatSemver(contract.version);
    let byProvider = this._contracts.get(contract.consumer);
    if (!byProvider) {
      byProvider = new Map();
      this._contracts.set(contract.consumer, byProvider);
    }
    let byVersion = byProvider.get(contract.provider);
    if (!byVersion) {
      byVersion = new Map();
      byProvider.set(contract.provider, byVersion);
    }
    const existing = byVersion.get(vKey);
    if (existing && !options.overwrite) {
      throw new Error(
        `contract already published: ${contract.consumer} -> ${contract.provider} @ ${vKey}`
      );
    }
    const stored: Contract = {
      ...contract,
      tags: options.tags ?? contract.tags,
      publishedAt: options.publishedAt ?? Date.now(),
    };
    byVersion.set(vKey, stored);
    if (existing) this._removeTagIndex(existing);
    this._addTagIndex(stored);
    this._published++;
    return stored;
  }

  private _key(c: Contract): string {
    return `${c.consumer}:::${c.provider}:::${formatSemver(c.version)}`;
  }

  private _addTagIndex(c: Contract): void {
    for (const t of c.tags) {
      let set = this._byTag.get(t);
      if (!set) {
        set = new Set();
        this._byTag.set(t, set);
      }
      set.add(this._key(c));
    }
  }

  private _removeTagIndex(c: Contract): void {
    const key = this._key(c);
    for (const t of c.tags) {
      this._byTag.get(t)?.delete(key);
    }
  }

  /** Fetch the exact contract version, or `undefined`. */
  fetch(consumer: string, provider: string, version: string | Semver): Contract | undefined {
    const v = typeof version === 'string' ? version : formatSemver(version);
    return this._contracts.get(consumer)?.get(provider)?.get(v);
  }

  /** Fetch the highest published version for a pair, or `undefined`. */
  fetchLatest(consumer: string, provider: string): Contract | undefined {
    const byVersion = this._contracts.get(consumer)?.get(provider);
    if (!byVersion) return undefined;
    let best: Contract | undefined;
    for (const c of byVersion.values()) {
      if (!best || compareSemver(c.version, best.version) > 0) best = c;
    }
    return best;
  }

  /** All versions of a pair, sorted ascending. */
  versions(consumer: string, provider: string): readonly Contract[] {
    const byVersion = this._contracts.get(consumer)?.get(provider);
    if (!byVersion) return [];
    return [...byVersion.values()].sort((a, b) => compareSemver(a.version, b.version));
  }

  /** Discover contracts carrying a tag. */
  findByTag(tag: string): readonly Contract[] {
    const keys = this._byTag.get(tag);
    if (!keys) return [];
    const out: Contract[] = [];
    for (const key of keys) {
      const [consumer, provider, version] = key.split(':::');
      const c = this.fetch(consumer, provider, version);
      if (c) out.push(c);
    }
    return out;
  }

  /** All contracts for a provider (any consumer/version). */
  forProvider(provider: string): readonly Contract[] {
    const out: Contract[] = [];
    for (const byProvider of this._contracts.values()) {
      const byVersion = byProvider.get(provider);
      if (byVersion) out.push(...byVersion.values());
    }
    return out;
  }

  /** List all (consumer, provider) pairs having at least one contract. */
  pairs(): readonly { consumer: string; provider: string }[] {
    const out: { consumer: string; provider: string }[] = [];
    for (const [consumer, byProvider] of this._contracts) {
      for (const provider of byProvider.keys()) {
        out.push({ consumer, provider });
      }
    }
    return out;
  }

  /** Total published contracts (including overwritten publishes). */
  get publishedCount(): number {
    return this._published;
  }
}

/* ------------------------------------------------------------------------ */
/* Provider verification                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Pluggable provider-side transport. The verifier replays the contract
 * request through this callback and matches the returned response.
 * In production this is an HTTP client; in tests it is any function that
 * mimics the provider's behavior — exactly how Pact's mock-provider hooks
 * work.
 */
export type ProviderHandler = (request: ContractRequest) => ContractResponse | Promise<ContractResponse>;

/** Provider-state setup hook (Pact "state handlers"). */
export type ProviderStateHandler = (state: string) => void | Promise<void>;

/** Per-interaction verification outcome. */
export interface InteractionVerification {
  readonly interactionId: string;
  readonly description: string;
  readonly providerState?: string;
  readonly matched: boolean;
  readonly mismatches: readonly MatchMismatch[];
  /** unified-diff-style rendering of body drift (empty when matched) */
  readonly diff: string;
  readonly durationMs: number;
}

/** Aggregate verification report for a whole contract. */
export interface VerificationReport {
  readonly consumer: string;
  readonly provider: string;
  readonly contractVersion: string;
  readonly verifiedAt: number;
  readonly success: boolean;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly InteractionVerification[];
}

/**
 * Replays a contract's interactions against a live (or simulated)
 * provider and reports mismatches with structural diffs.
 */
export class ProviderVerifier {
  private readonly _stateHandlers = new Map<string, ProviderStateHandler>();

  constructor(private readonly _handler: ProviderHandler) {}

  /** Register a hook run before interactions carrying `state`. */
  onProviderState(state: string, handler: ProviderStateHandler): this {
    this._stateHandlers.set(state, handler);
    return this;
  }

  /** Verify one interaction. */
  async verifyInteraction(
    interaction: ContractInteraction,
    globalRules: readonly MatchingRule[]
  ): Promise<InteractionVerification> {
    const started = Date.now();
    if (interaction.providerState) {
      const hook = this._stateHandlers.get(interaction.providerState);
      if (hook) await hook(interaction.providerState);
    }
    const actual = await this._handler(interaction.request);

    // Status is strict equality; headers use rules when present, else
    // expected headers must all be present with equal values (the actual
    // response may carry extra headers — pact semantics).
    const mismatches: MatchMismatch[] = [];
    if (actual.status !== interaction.response.status) {
      mismatches.push({
        path: '$.status',
        expected: String(interaction.response.status),
        actual: String(actual.status),
        reason: 'status code mismatch',
      });
    }
    const expHeaders = interaction.response.headers ?? {};
    for (const [k, v] of Object.entries(expHeaders)) {
      const got = actual.headers?.[k];
      if (got !== v) {
        mismatches.push({
          path: `$.headers.${k}`,
          expected: v,
          actual: got ?? '<missing>',
          reason: 'header mismatch',
        });
      }
    }
    const matchers = new MatcherSet([
      ...globalRules,
      ...(interaction.matchingRules ?? []),
    ]);
    const bodyResult = matchValue(
      interaction.response.body,
      actual.body,
      matchers,
      ['body']
    );
    mismatches.push(...bodyResult.mismatches);

    const diffEntries =
      interaction.response.body !== undefined && actual.body !== undefined
        ? structuralDiff(interaction.response.body, actual.body)
        : [];

    return {
      interactionId: interaction.id,
      description: interaction.description,
      providerState: interaction.providerState,
      matched: mismatches.length === 0,
      mismatches,
      diff: formatDiff(diffEntries),
      durationMs: Date.now() - started,
    };
  }

  /** Verify every interaction of a contract in declaration order. */
  async verify(contract: Contract): Promise<VerificationReport> {
    const results: InteractionVerification[] = [];
    for (const i of contract.interactions) {
      results.push(await this.verifyInteraction(i, contract.matchingRules));
    }
    const failed = results.filter((r) => !r.matched).length;
    return {
      consumer: contract.consumer,
      provider: contract.provider,
      contractVersion: formatSemver(contract.version),
      verifiedAt: Date.now(),
      success: failed === 0,
      total: results.length,
      passed: results.length - failed,
      failed,
      results,
    };
  }
}
