/**
 * Gateway Engine
 *
 * Orchestrates the full request path through the gateway:
 *
 *   authenticate (API key) --> route match (path+version)
 *     --> rate limit (consumer then route)
 *     --> cache lookup (GET only)
 *     --> circuit admit --> transform --> proxy (upstream fn)
 *     --> transform response --> cache store --> log
 *
 * The "proxy" step is delegated to an injectable transport function so
 * the engine stays transport-agnostic (HTTP adapter, in-process mock,
 * or tests).
 *
 * @module ApiGatewayLayer/Engine
 */

import {
  GatewayRequest,
  GatewayResponse,
  GatewayRoute,
  GatewayConsumer,
  GatewayClock,
  SystemGatewayClock,
  RandomSource,
  DefaultRandomSource,
  CanaryRules,
  CircuitBreakerConfig,
} from './types';
import { RouteMatcher } from './RouteMatcher';
import { TransformPipeline } from './TransformPipeline';
import { ApiKeyManager } from './ApiKeyManager';
import { TokenBucketRateLimiter } from './RateLimiter';
import { CircuitBreakerRegistry, CircuitOpenError } from './CircuitBreaker';
import { AccessLogger, PiiMaskingConfig } from './PiiMaskingLogger';
import { GatewayResponseCache } from './ResponseCache';

/** Transport function: sends a transformed request upstream. */
export type UpstreamTransport = (input: {
  upstreamBaseUrl: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string[]>;
  body?: unknown;
}) => Promise<GatewayResponse>;

/** Engine configuration. */
export interface GatewayEngineConfig {
  readonly clock?: GatewayClock;
  readonly random?: RandomSource;
  readonly canary?: CanaryRules;
  readonly circuit?: CircuitBreakerConfig;
  readonly cache?: { capacity?: number; defaultTtlMs?: number };
  readonly logCapacity?: number;
  readonly masking?: Partial<PiiMaskingConfig>;
  /** Header carrying the API key. Default `x-api-key`. */
  readonly apiKeyHeader?: string;
  /** Whether requests without a key may hit routes (anonymous). */
  readonly allowAnonymous?: boolean;
}

/** Outcome categories for handled requests. */
export type GatewayOutcome =
  | 'ok'
  | 'cache-hit'
  | 'unauthorized'
  | 'not-found'
  | 'version-mismatch'
  | 'rate-limited'
  | 'circuit-open'
  | 'upstream-error';

export interface HandledResponse extends GatewayResponse {
  readonly outcome: GatewayOutcome;
  readonly routeId?: string;
  readonly upstreamName?: string;
  readonly latencyMs: number;
}

function jsonResponse(status: number, body: Record<string, unknown>): GatewayResponse {
  return {
    status,
    headers: { 'content-type': ['application/json'] },
    body,
  };
}

let requestCounter = 0;

/**
 * The gateway engine itself — facade over all sub-engines.
 */
export class GatewayEngine {
  readonly router: RouteMatcher;
  readonly transforms: TransformPipeline;
  readonly keys: ApiKeyManager;
  readonly rateLimiter: TokenBucketRateLimiter;
  readonly circuits: CircuitBreakerRegistry;
  readonly logger: AccessLogger;
  readonly cache: GatewayResponseCache;

  private _clock: GatewayClock;
  private _apiKeyHeader: string;
  private _allowAnonymous: boolean;
  private _transport: UpstreamTransport;

  constructor(
    transport: UpstreamTransport,
    config?: GatewayEngineConfig
  ) {
    this._clock = config?.clock ?? new SystemGatewayClock();
    const random = config?.random ?? new DefaultRandomSource();
    this._transport = transport;
    this._apiKeyHeader = (config?.apiKeyHeader ?? 'x-api-key').toLowerCase();
    this._allowAnonymous = config?.allowAnonymous ?? false;

    this.router = new RouteMatcher(random);
    this.router.setCanaryRules(config?.canary);
    this.transforms = new TransformPipeline();
    this.keys = new ApiKeyManager(this._clock);
    this.rateLimiter = new TokenBucketRateLimiter(this._clock);
    this.circuits = new CircuitBreakerRegistry(config?.circuit, this._clock);
    this.logger = new AccessLogger({
      capacity: config?.logCapacity,
      masking: config?.masking,
      clock: this._clock,
    });
    this.cache = new GatewayResponseCache({
      capacity: config?.cache?.capacity,
      defaultTtlMs: config?.cache?.defaultTtlMs,
      clock: this._clock,
    });
  }

  /** Register a route. */
  addRoute(route: GatewayRoute): void {
    this.router.register(route);
    if (route.circuit) {
      for (const u of route.upstreams) {
        this.circuits.configure(u.name, route.circuit);
      }
    }
  }

  /** Remove a route. */
  removeRoute(routeId: string): boolean {
    return this.router.unregister(routeId);
  }

  /** Update canary routing policy. */
  setCanaryRules(rules: CanaryRules | undefined): void {
    this.router.setCanaryRules(rules);
  }

  /** Register a consumer (identity for keys and rate limits). */
  addConsumer(consumer: GatewayConsumer): void {
    this.keys.registerConsumer(consumer);
  }

  /**
   * Handle one inbound request end-to-end. Never throws — all failure
   * modes are encoded as a HandledResponse.
   */
  async handle(request: GatewayRequest): Promise<HandledResponse> {
    const startedAt = this._clock.now();
    const finish = (
      resp: GatewayResponse,
      outcome: GatewayOutcome,
      extra?: { routeId?: string; upstreamName?: string }
    ): HandledResponse => {
      const latencyMs = this._clock.now() - startedAt;
      this.logger.record({
        requestId: request.id,
        method: request.method,
        path: request.path,
        status: resp.status,
        consumerId: request.consumer?.id,
        routeId: extra?.routeId,
        latencyMs,
        headers: request.headers,
        body: request.body,
        meta: { outcome },
      });
      return { ...resp, outcome, latencyMs, ...extra };
    };

    // 1. Authenticate (optional)
    const keyValues = request.headers[this._apiKeyHeader];
    if (keyValues && keyValues.length > 0) {
      const verify = this.keys.verify(keyValues[0]!);
      if (!verify.ok || !verify.key) {
        return finish(jsonResponse(401, { error: 'invalid_api_key', reason: verify.reason }), 'unauthorized');
      }
      const consumer = this.keys.getConsumer(verify.key.consumerId);
      if (consumer) request.consumer = consumer;
    } else if (!this._allowAnonymous) {
      return finish(jsonResponse(401, { error: 'missing_api_key' }), 'unauthorized');
    }

    // 2. Route match
    const match = this.router.match({
      method: request.method,
      path: request.path,
      headers: request.headers,
      query: request.query,
      consumerGroup: request.consumer?.group,
    });
    if (!match) {
      // Distinguish version mismatches when a version header was sent.
      const hadVersion =
        request.headers['x-api-version'] !== undefined ||
        request.query['version'] !== undefined;
      return finish(
        jsonResponse(404, { error: 'no_route', path: request.path }),
        hadVersion ? 'version-mismatch' : 'not-found'
      );
    }
    const routeId = match.route.id;
    const upstreamName = match.upstream.name;

    // 3. Rate limit: consumer policy wins over route policy.
    const consumerPolicy = request.consumer?.rateLimit;
    if (consumerPolicy && request.consumer) {
      const d = this.rateLimiter.consume(`consumer:${request.consumer.id}`, consumerPolicy, 'consumer');
      if (!d.allowed) {
        const resp = jsonResponse(429, { error: 'rate_limited', scope: 'consumer' });
        const headers: Record<string, string[]> = { ...resp.headers };
        if (d.retryAfterSeconds !== undefined) {
          headers['retry-after'] = [String(d.retryAfterSeconds)];
        }
        return finish({ ...resp, headers }, 'rate-limited', { routeId, upstreamName });
      }
    }
    const routePolicy = match.route.rateLimit;
    if (routePolicy) {
      const key = `route:${routeId}:${request.consumer?.id ?? 'anon'}`;
      const d = this.rateLimiter.consume(key, routePolicy, 'route');
      if (!d.allowed) {
        const resp = jsonResponse(429, { error: 'rate_limited', scope: 'route' });
        const headers: Record<string, string[]> = { ...resp.headers };
        if (d.retryAfterSeconds !== undefined) {
          headers['retry-after'] = [String(d.retryAfterSeconds)];
        }
        return finish({ ...resp, headers }, 'rate-limited', { routeId, upstreamName });
      }
    }

    // 4. Cache lookup (idempotent methods only)
    const cacheable =
      match.route.cacheable === true &&
      (request.method === 'GET' || request.method === 'HEAD');
    if (cacheable) {
      const hit = this.cache.get({
        routeId,
        consumerId: request.consumer?.id,
        method: request.method,
        path: request.path,
        query: request.query,
        headers: request.headers,
      });
      if (hit) {
        return finish(
          { ...hit, cacheHit: true },
          'cache-hit',
          { routeId, upstreamName }
        );
      }
    }

    // 5. Circuit admit
    try {
      this.circuits.admit(upstreamName);
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        return finish(
          jsonResponse(503, { error: 'circuit_open', upstream: upstreamName }),
          'circuit-open',
          { routeId, upstreamName }
        );
      }
      throw err;
    }

    // 6. Transform + proxy
    const transformed = this.transforms.applyRequest(
      request,
      match,
      match.upstream.baseUrl + request.path
    );
    try {
      const upstreamResp = await this._transport({
        upstreamBaseUrl: match.upstream.baseUrl,
        method: transformed.request.method,
        path: transformed.request.upstreamPath,
        query: transformed.request.query,
        headers: transformed.request.headers,
        body: transformed.request.body,
      });
      const ok = upstreamResp.status < 500;
      if (ok) this.circuits.onSuccess(upstreamName);
      else this.circuits.onFailure(upstreamName);

      const resp = this.transforms.applyResponse(upstreamResp, match, request.headers);
      if (cacheable && upstreamResp.status >= 200 && upstreamResp.status < 300) {
        this.cache.set(
          {
            routeId,
            consumerId: request.consumer?.id,
            method: request.method,
            path: request.path,
            query: request.query,
            headers: request.headers,
          },
          resp,
          match.route.cacheTtlMs
        );
      }
      return finish(resp, 'ok', { routeId, upstreamName });
    } catch (err) {
      this.circuits.onFailure(upstreamName);
      return finish(
        jsonResponse(502, {
          error: 'upstream_error',
          message: err instanceof Error ? err.message : 'unknown',
        }),
        'upstream-error',
        { routeId, upstreamName }
      );
    }
  }

  /** Generate a request id (monotonic, unique per process). */
  static nextRequestId(): string {
    requestCounter++;
    return `req_${Date.now().toString(36)}_${requestCounter.toString(36)}`;
  }
}
