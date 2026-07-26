/**
 * CanaryDeployQueryHandler
 *
 * Handles canary-deploy queries.
 */

export interface CanaryDeployQuery {
  type: string;
  params: Record<string, unknown>;
}

export interface CanaryDeployQueryResult {
  success: boolean;
  data?: unknown;
  error?: string;
  cached: boolean;
}

type QueryHandlerFn = (query: CanaryDeployQuery) => Promise<unknown>;

export class CanaryDeployQueryHandler {
  private _handlers: Map<string, QueryHandlerFn>;
  private _cache: Map<string, { data: unknown; expiresAt: number }>;
  private _cacheTtlMs: number;

  constructor(cacheTtlMs: number = 60000) {
    this._handlers = new Map();
    this._cache = new Map();
    this._cacheTtlMs = cacheTtlMs;
  }

  register(queryType: string, handler: QueryHandlerFn): void {
    this._handlers.set(queryType, handler);
  }

  async handle(query: CanaryDeployQuery): Promise<CanaryDeployQueryResult> {
    const cacheKey = query.type + ':' + JSON.stringify(query.params);
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { success: true, data: cached.data, cached: true };
    }
    const handler = this._handlers.get(query.type);
    if (!handler) {
      return { success: false, error: 'No handler for query type: ' + query.type, cached: false };
    }
    try {
      const data = await handler(query);
      this._cache.set(cacheKey, { data: data, expiresAt: Date.now() + this._cacheTtlMs });
      return { success: true, data: data, cached: false };
    } catch (e) {
      return { success: false, error: (e as Error).message, cached: false };
    }
  }

  clearCache(): void {
    this._cache.clear();
  }
  getCacheSize(): number {
    return this._cache.size;
  }
  getRegisteredQueries(): string[] {
    return Array.from(this._handlers.keys());
  }

  setCacheTtl(ttlMs: number): void {
    this._cacheTtlMs = ttlMs;
  }
}
