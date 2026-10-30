/**
 * ContractDsl — fluent consumer-driven contract authoring + HTTP adapter
 *
 * A compact DSL for declaring consumer contracts the way real pact tests
 * read:
 *
 * ```ts
 * const contract = await contractDsl('web', 'api')
 *   .given('user 42 exists')
 *   .uponReceiving('a request for user 42')
 *   .withRequest({ method: 'GET', path: '/users/42' })
 *   .willRespondWith({ status: 200, body: { id: like(42) } })
 *   .build();
 * ```
 *
 * `like()`, `eachLike()`, `regex()`, `integer()`, `somethingLike()`
 * produce {@link MatchingRule}s inline in the body template — the DSL
 * walks the response spec, extracts marker objects into rules, and
 * emits a clean {@link Contract}.
 *
 * {@link HttpContractAdapter} adapts the engine's `ProviderHandler` to
 * a fetch-like function for real HTTP verification.
 *
 * @module ContractTesting/Engine
 */

import { Json, MatchingRule } from './ContractMatchers';
import {
  Contract,
  ContractInteraction,
  ContractRequest,
  ContractResponse,
  ProviderHandler,
  Semver,
  parseSemver,
} from './ContractRegistry';

/* ------------------------------------------------------------------------ */
/* Inline matcher markers                                                   */
/* ------------------------------------------------------------------------ */

/** Marker embedded in a body template — replaced by its rule at build. */
export interface MatcherMarker {
  readonly __matcher: true;
  readonly matcher: MatchingRule['matcher'];
  readonly template?: Json;
  readonly pattern?: string;
  readonly min?: number;
  readonly max?: number;
  readonly exact?: number;
}

function marker(
  matcher: MatchingRule['matcher'],
  extra: Partial<MatcherMarker> = {}
): MatcherMarker {
  return { __matcher: true, matcher, ...extra };
}

function isMarker(v: unknown): v is MatcherMarker {
  return typeof v === 'object' && v !== null && (v as MatcherMarker).__matcher === true;
}

/**
 * `like(template)` — value must match template's shape.
 * In templates, nested markers are also allowed:
 * `like({ id: integer(), name: 'x' })`.
 */
export function like(template: unknown): MatcherMarker {
  return marker('like', { template: template as Json });
}

/** `eachLike(template, min?)` — array of matching elements. */
export function eachLike(template: unknown, min?: number): MatcherMarker {
  return marker('eachLike', { template: template as Json, min });
}

/** `regex(pattern)` — string matches regex. */
export function regex(pattern: string, example?: string): MatcherMarker {
  return marker('regex', { pattern, template: example });
}

/** Integer-valued number. */
export function integer(example?: number): MatcherMarker {
  return marker('integer', { template: example });
}

/** Finite number (any int/float). */
export function decimal(example?: number): MatcherMarker {
  return marker('decimal', { template: example });
}

/** Boolean. */
export function bool(example?: boolean): MatcherMarker {
  return marker('boolean', { template: example });
}

/** ISO-8601 date/datetime/uuid helpers. */
export function iso8601(example?: string): MatcherMarker {
  return marker('datetime', { template: example });
}

export function uuidLike(example?: string): MatcherMarker {
  return marker('uuid', { template: example });
}

/** Array length constraints. */
export function arrayLength(opts: { min?: number; max?: number; exact?: number }): MatcherMarker {
  return marker('arrayLength', opts);
}

/* ------------------------------------------------------------------------ */
/* Template expansion                                                       */
/* ------------------------------------------------------------------------ */

interface Expanded {
  readonly value: Json;
  readonly rules: MatchingRule[];
}

/**
 * Walk a response/request template, replacing marker objects with their
 * template values and emitting {@link MatchingRule}s at the paths where
 * markers were found. Nested markers inside `like` templates are
 * expanded recursively.
 *
 * Complexity: O(nodes in template).
 */
function expandTemplate(template: unknown, path: string): Expanded {
  const rules: MatchingRule[] = [];

  const walk = (v: unknown, p: string): Json => {
    if (isMarker(v)) {
      const rule: MatchingRule = {
        path: p,
        matcher: v.matcher,
        pattern: v.pattern,
        min: v.min,
        max: v.max,
        exact: v.exact,
      };
      // template for like/eachLike expands nested markers
      if (v.matcher === 'like' || v.matcher === 'eachLike') {
        const inner = walk(v.template, p);
        rules.push({ ...rule, template: inner });
        return inner;
      }
      rules.push({ ...rule, template: v.template });
      // emit the example value (or a type-plausible default)
      return v.template ?? defaultFor(v.matcher);
    }
    if (Array.isArray(v)) {
      return v.map((el, i) => walk(el, `${p}[${i}]`));
    }
    if (v !== null && typeof v === 'object') {
      const out: Record<string, Json> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(val, `${p}.${k}`);
      }
      return out;
    }
    return v as Json;
  };

  const value = walk(template, path);
  return { value, rules };
}

function defaultFor(m: MatchingRule['matcher']): Json {
  switch (m) {
    case 'integer': return 0;
    case 'decimal': case 'number': return 0;
    case 'boolean': return true;
    case 'nullValue': return null;
    case 'uuid': return '00000000-0000-4000-8000-000000000000';
    case 'ipv4': return '0.0.0.0';
    case 'email': return 'a@b.co';
    case 'date': return '1970-01-01';
    case 'time': return '00:00:00';
    case 'datetime': return '1970-01-01T00:00:00Z';
    case 'arrayLength': case 'eachLike': case 'like': return [];
    default: return '';
  }
}

/* ------------------------------------------------------------------------ */
/* Fluent builder                                                           */
/* ------------------------------------------------------------------------ */

interface DraftInteraction {
  providerState?: string;
  description?: string;
  request?: ContractRequest;
  response?: ContractResponse;
  matchingRules: MatchingRule[];
}

/**
 * Fluent contract builder in the pact style. Each interaction is
 * declared `given → uponReceiving → withRequest → willRespondWith`,
 * with matchers embedded as marker functions in the response template.
 */
export class ContractDsl {
  private readonly _draft: DraftInteraction[] = [];
  private _current: DraftInteraction | undefined;
  private _version: Semver = { major: 1, minor: 0, patch: 0 };
  private readonly _globalRules: MatchingRule[] = [];

  constructor(
    private readonly _consumer: string,
    private readonly _provider: string
  ) {}

  version(v: string): this {
    this._version = parseSemver(v);
    return this;
  }

  /** Add a global matching rule applying to every interaction. */
  matchingRule(rule: MatchingRule): this {
    this._globalRules.push(rule);
    return this;
  }

  /** Begin an interaction with provider state. */
  given(state: string): this {
    this._current = { providerState: state, matchingRules: [] };
    return this;
  }

  /** Begin an interaction (no provider state). */
  uponReceiving(description: string): this {
    if (!this._current) this._current = { matchingRules: [] };
    this._current.description = description;
    return this;
  }

  /** Declare the request the consumer will send. */
  withRequest(req: {
    method: ContractRequest['method'];
    path: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  }): this {
    if (!this._current) this._current = { matchingRules: [] };
    const expanded = req.body !== undefined ? expandTemplate(req.body, '$.body') : undefined;
    this._current.request = {
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: expanded?.value as Json | undefined,
    };
    if (expanded) this._current.matchingRules.push(...expanded.rules);
    return this;
  }

  /** Declare the expected response; markers become matching rules. */
  willRespondWith(res: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  }): this {
    if (!this._current) this._current = { matchingRules: [] };
    const expanded = res.body !== undefined ? expandTemplate(res.body, '$.body') : undefined;
    this._current.response = {
      status: res.status,
      headers: res.headers,
      body: expanded?.value as Json | undefined,
    };
    if (expanded) this._current.matchingRules.push(...expanded.rules);
    this._draft.push(this._current);
    this._current = undefined;
    return this;
  }

  /** Materialize the contract. */
  build(): Contract {
    const interactions: ContractInteraction[] = this._draft.map((d, i) => ({
      id: `interaction-${i + 1}`,
      description: d.description ?? `interaction ${i + 1}`,
      providerState: d.providerState,
      request: d.request ?? { method: 'GET', path: '/' },
      response: d.response ?? { status: 200 },
      matchingRules: d.matchingRules,
    }));
    return {
      consumer: this._consumer,
      provider: this._provider,
      version: this._version,
      interactions,
      matchingRules: [...this._globalRules],
      publishedAt: 0,
      tags: [],
    };
  }
}

/** Factory entry point. */
export function contractDsl(consumer: string, provider: string): ContractDsl {
  return new ContractDsl(consumer, provider);
}

/* ------------------------------------------------------------------------ */
/* HTTP adapter                                                             */
/* ------------------------------------------------------------------------ */

/** Minimal fetch signature the adapter consumes. */
export type FetchLike = (req: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; headers: Record<string, string>; text(): Promise<string> }>;

/**
 * Adapt a fetch-like function to the engine's {@link ProviderHandler}
 * so {@link ProviderVerifier} can verify against a live HTTP endpoint.
 */
export function httpProviderHandler(baseUrl: string, fetchFn: FetchLike): ProviderHandler {
  const base = baseUrl.replace(/\/$/, '');
  return async (request: ContractRequest): Promise<ContractResponse> => {
    const qs = new URLSearchParams(request.query ?? {}).toString();
    const url = `${base}${request.path}${qs ? `?${qs}` : ''}`;
    const res = await fetchFn({
      url,
      method: request.method,
      headers: { ...(request.headers ?? {}) },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    });
    let body: Json | undefined;
    const text = await res.text();
    if (text.length > 0) {
      try {
        const parsed: unknown = JSON.parse(text);
        body = parsed as Json;
      } catch {
        body = text as unknown as Json;
      }
    }
    return { status: res.status, headers: res.headers, body };
  };
}
