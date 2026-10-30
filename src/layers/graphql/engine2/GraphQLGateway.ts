/**
 * GraphQL Gateway — composes the engine2 primitives into one pipeline.
 *
 * Request flow:
 *
 *   APQ hash? ──hit──▶ text ──▶ parse ──▶ complexity check ──▶ execute
 *      │miss                                              │
 *      └─ PersistedQueryNotFound (client retries w/ text)  ▼
 *                                              dataloader-scoped resolvers
 *
 * The gateway owns one `PersistedQueryRegistry` across requests (it's
 * the shared cache) but hands each request a *fresh* `DataLoader` —
 * request-scoped batching, which is the whole point of DataLoader.
 *
 * Also enforces the complexity gate *before* execution, so expensive
 * queries are rejected before resolvers run.
 *
 * @module GraphqlLayer/Engine2
 */

import { DocumentNode } from '../implementations/ast/ast';
import { parse } from '../implementations/parser/Parser';
import { DataLoader } from './DataLoader';
import { PersistedQueryRegistry } from './PersistedQueryRegistry';
import { ComplexityConfig, QueryComplexityAnalyzer } from './QueryComplexityAnalyzer';

/** What the caller provides per request. */
export interface GraphQLRequest {
  /** Full query text (APQ retry or first request). */
  readonly query?: string;
  /** APQ hash — used alone on hit; ignored when query is present. */
  readonly hash?: string;
  readonly operationName?: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export type GatewayResponse =
  | { status: 'execute'; document: DocumentNode; queryText: string }
  | { status: 'persisted-query-not-found' }
  | { status: 'complexity-rejected'; violations: readonly string[] }
  | { status: 'parse-error'; message: string };

export class GraphQLGateway {
  readonly registry: PersistedQueryRegistry;
  readonly complexity: QueryComplexityAnalyzer;

  constructor(opts: { registry?: PersistedQueryRegistry; complexity?: ComplexityConfig } = {}) {
    this.registry = opts.registry ?? new PersistedQueryRegistry();
    this.complexity = new QueryComplexityAnalyzer(opts.complexity);
  }

  /**
   * Resolve a request to either an executable document or a rejection.
   * Handles the APQ two-step transparently.
   */
  prepare(req: GraphQLRequest): GatewayResponse {
    // APQ: hash-only request → resolve or ask for the text.
    if (req.query === undefined) {
      if (req.hash === undefined) {
        return { status: 'parse-error', message: 'request must include query or hash' };
      }
      const resolved = this.registry.resolveHash(req.hash);
      if (resolved.status === 'miss') {
        return { status: 'persisted-query-not-found' };
      }
      return this._checkText(resolved.text, req.operationName);
    }

    // Full query — register it under APQ if a hash was sent alongside
    // (the standard "retry with query+hash" flow), then proceed.
    if (req.hash !== undefined) {
      this.registry.register(req.query);
    }
    return this._checkText(req.query, req.operationName);
  }

  /**
   * Fresh per-request DataLoader for one resolver namespace.
   * Callers create one per (request, entity-type) pair.
   */
  createLoader<K, V>(batchFn: (keys: readonly K[]) => Promise<readonly (V | Error)[]>): DataLoader<K, V> {
    return new DataLoader<K, V>(batchFn);
  }

  /* ---------------------------------------------------------------- */

  private _checkText(text: string, operationName?: string): GatewayResponse {
    let doc: DocumentNode;
    try {
      doc = parse(text);
    } catch (err) {
      return { status: 'parse-error', message: (err as Error).message };
    }
    const report = this.complexity.analyze(doc, operationName);
    if (!report.ok) {
      return {
        status: 'complexity-rejected',
        violations: report.violations.map((v) => v.message),
      };
    }
    return { status: 'execute', document: doc, queryText: text };
  }
}
