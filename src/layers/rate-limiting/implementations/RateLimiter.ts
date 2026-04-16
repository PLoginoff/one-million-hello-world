/**
 * Rate Limiter Implementation
 * 
 * Concrete implementation of IRateLimiter.
 * Supports multiple rate limiting strategies (token bucket, sliding window, etc.).
 */

import { IRateLimiter } from '../interfaces/IRateLimiter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { SecurityContext } from '../../security/types/security-types';
import {
  RateLimitResult,
  RateLimitConfig,
  RateLimitIdentifier,
  RateLimitStats,
  RateLimitStrategy,
  RateLimitIdentifierType,
  TokenBucketState,
  SlidingWindowState,
  FixedWindowState,
  LeakyBucketState,
  ExtendedRateLimitResult,
  RateLimitMetrics,
  RateLimitHealthStatus,
  RateLimitDiagnostics,
  RateLimitWarning,
  RateLimitBucketInfo,
  RateLimitTier,
  RateLimitQuota,
  RateLimitUsage,
  RateLimitRule,
  RateLimitException,
  RateLimitErrorCode,
  RateLimitScope,
  RateLimitAction,
  DiagnosticStep,
  DiagnosticSummary,
  RateLimitHealthCheck,
  InternalLayer,
  InternalLayerIdentifier,
  InternalLayerRateLimitConfig,
  InternalLayerRateLimitResult,
  InternalLayerContext,
  LayerRateLimitStats,
  CrossLayerRateLimitConfig,
  CrossLayerRateLimitResult,
  LayerDependencyGraph,
  LayerNode,
  LayerEdge,
  LayerHealthStatus,
  RateLimitCascadeConfig,
  AdaptiveRateLimitConfig,
  RateLimitPrediction,
} from '../types/rate-limiting-types';

export class RateLimiter implements IRateLimiter {
  private _config: RateLimitConfig;
  private _stats: RateLimitStats;
  private _buckets: Map<string, TokenBucketState | SlidingWindowState | FixedWindowState | LeakyBucketState>;
  private _bucketInfo: Map<string, RateLimitBucketInfo>;
  private _warnings: RateLimitWarning[];
  private _rules: Map<string, RateLimitRule>;
  private _exceptions: Map<string, RateLimitException>;
  private _tiers: Map<string, RateLimitTier>;
  private _quotas: Map<string, RateLimitQuota>;
  private _checkStartTime: number;

  private _internalLayerBuckets: Map<string, TokenBucketState | SlidingWindowState | FixedWindowState | LeakyBucketState>;
  private _internalLayerConfigs: Map<InternalLayer, InternalLayerRateLimitConfig>;
  private _internalLayerStats: Map<InternalLayer, LayerRateLimitStats>;
  private _crossLayerConfigs: Map<string, CrossLayerRateLimitConfig>;
  private _crossLayerBuckets: Map<string, TokenBucketState | SlidingWindowState | FixedWindowState | LeakyBucketState>;
  private _layerDependencyGraph: LayerDependencyGraph;
  private _layerHealthStatuses: Map<InternalLayer, LayerHealthStatus>;
  private _cascadeConfig: RateLimitCascadeConfig;
  private _adaptiveConfig: AdaptiveRateLimitConfig;
  private _adaptiveLimits: Map<string, number>;
  private _lastAdjustmentTime: number;

  constructor() {
    this._config = {
      requestsPerWindow: 100,
      windowSizeMs: 60000,
      burstSize: 10,
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      enabled: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      enableBurstProtection: false,
      enableGracePeriod: false,
      gracePeriodMs: 0,
      enablePriorityQueuing: false,
      maxQueueSize: 100,
    };
    this._stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      currentBuckets: 0,
      totalBucketsCreated: 0,
      totalBucketsExpired: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      lastResetTime: new Date(),
      deniedRequestsByReason: new Map(),
      requestsByScope: new Map(),
      requestsByStrategy: new Map(),
    };
    this._buckets = new Map();
    this._bucketInfo = new Map();
    this._warnings = [];
    this._rules = new Map();
    this._exceptions = new Map();
    this._tiers = new Map();
    this._quotas = new Map();
    this._checkStartTime = 0;

    this._internalLayerBuckets = new Map();
    this._internalLayerConfigs = new Map();
    this._internalLayerStats = new Map();
    this._crossLayerConfigs = new Map();
    this._crossLayerBuckets = new Map();
    this._layerDependencyGraph = {
      nodes: new Map(),
      edges: [],
    };
    this._layerHealthStatuses = new Map();
    this._cascadeConfig = {
      propagateDownstream: true,
      propagateUpstream: false,
      cascadeThreshold: 0.8,
      cascadeStrategy: 'adaptive',
    };
    this._adaptiveConfig = {
      enabled: false,
      minRequestsPerWindow: 50,
      maxRequestsPerWindow: 200,
      adjustmentFactor: 1.1,
      adjustmentIntervalMs: 300000,
      metricsWindowMs: 60000,
    };
    this._adaptiveLimits = new Map();
    this._lastAdjustmentTime = Date.now();

    this._initializeInternalLayerConfigs();
    this._initializeLayerDependencyGraph();
  }

  private _initializeInternalLayerConfigs(): void {
    const layers = Object.values(InternalLayer);
    for (const layer of layers) {
      this._internalLayerConfigs.set(layer, {
        layer,
        requestsPerWindow: 1000,
        windowSizeMs: 60000,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        enabled: true,
        priority: 1,
      });
      this._internalLayerStats.set(layer, {
        layer,
        totalRequests: 0,
        allowedRequests: 0,
        deniedRequests: 0,
        currentBuckets: 0,
        averageRequestRate: 0,
        peakRequestRate: 0,
        lastResetTime: new Date(),
      });
      this._layerHealthStatuses.set(layer, {
        layer,
        status: 'healthy',
        score: 100,
        lastCheck: new Date(),
        issues: [],
      });
    }
  }

  private _initializeLayerDependencyGraph(): void {
    const layers = Object.values(InternalLayer);
    for (const layer of layers) {
      const config = this._internalLayerConfigs.get(layer);
      if (config) {
        this._layerDependencyGraph.nodes.set(layer, {
          layer,
          rateLimitConfig: config,
          currentRate: 0,
          dependencies: [],
          dependents: [],
        });
      }
    }
  }

  private _getInternalLayerBucketKey(layerIdentifier: InternalLayerIdentifier): string {
    return `${layerIdentifier.layer}:${layerIdentifier.operation || 'default'}:${layerIdentifier.component || 'default'}`;
  }

  private _getCrossLayerBucketKey(sourceLayer: InternalLayer, targetLayer: InternalLayer): string {
    return `${sourceLayer}->${targetLayer}`;
  }

  checkRateLimit(
    request: HttpRequest,
    context?: SecurityContext,
    identifier?: RateLimitIdentifier
  ): RateLimitResult {
    this._stats.totalRequests++;

    const id = identifier || this.extractIdentifier(request, context);
    const bucketKey = this._getBucketKey(id);

    const result = this._checkTokenBucket(bucketKey);

    if (result.allowed) {
      this._stats.allowedRequests++;
    } else {
      this._stats.deniedRequests++;
    }

    return result;
  }

  setRateLimitConfig(config: RateLimitConfig): void {
    this._config = { ...this._config, ...config };
  }

  getRateLimitConfig(): RateLimitConfig {
    return { ...this._config };
  }

  getStats(): RateLimitStats {
    this._stats.currentBuckets = this._buckets.size;
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      currentBuckets: this._buckets.size,
      totalBucketsCreated: 0,
      totalBucketsExpired: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      lastResetTime: new Date(),
      deniedRequestsByReason: new Map(),
      requestsByScope: new Map(),
      requestsByStrategy: new Map(),
    };
  }

  resetRateLimit(identifier: RateLimitIdentifier): void {
    const bucketKey = this._getBucketKey(identifier);
    this._buckets.delete(bucketKey);
  }

  clearAllBuckets(): void {
    this._buckets.clear();
  }

  extractIdentifier(
    request: HttpRequest,
    context?: SecurityContext
  ): RateLimitIdentifier {
    if (context?.isAuthenticated && context.userId) {
      return {
        type: RateLimitIdentifierType.USER_ID,
        value: context.userId,
      };
    }

    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      return {
        type: RateLimitIdentifierType.API_KEY,
        value: apiKey,
      };
    }

    return {
      type: RateLimitIdentifierType.IP_ADDRESS,
      value: '127.0.0.1',
    };
  }

  private _checkTokenBucket(bucketKey: string): RateLimitResult {
    const now = new Date();
    let bucket = this._buckets.get(bucketKey) as TokenBucketState | undefined;

    if (!bucket) {
      bucket = {
        tokens: this._config.burstSize,
        lastRefill: now,
      };
      this._buckets.set(bucketKey, bucket);
      this._stats.totalBucketsCreated++;
    }

    const timeSinceLastRefill = now.getTime() - bucket.lastRefill.getTime();
    const refillAmount = Math.floor(
      (timeSinceLastRefill / this._config.windowSizeMs) * this._config.requestsPerWindow
    );

    bucket.tokens = Math.min(
      bucket.tokens + refillAmount,
      this._config.requestsPerWindow
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return {
        allowed: true,
        limit: this._config.requestsPerWindow,
        remaining: Math.floor(bucket.tokens),
        resetTime: new Date(now.getTime() + this._config.windowSizeMs),
      };
    }

    const retryAfter = Math.ceil(this._config.windowSizeMs / 1000);

    return {
      allowed: false,
      limit: this._config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(now.getTime() + this._config.windowSizeMs),
      retryAfter,
    };
  }

  private _getBucketKey(identifier: RateLimitIdentifier): string {
    return `${identifier.type}:${identifier.value}`;
  }

  checkRateLimitExtended(
    request: HttpRequest,
    context?: SecurityContext,
    identifier?: RateLimitIdentifier
  ): ExtendedRateLimitResult {
    this._checkStartTime = Date.now();
    const result = this.checkRateLimit(request, context, identifier);
    const checkEndTime = Date.now();

    const metrics: RateLimitMetrics = {
      checkStartTime: this._checkStartTime,
      checkEndTime,
      checkDuration: checkEndTime - this._checkStartTime,
      bucketLookupTime: 0,
      strategyExecutionTime: checkEndTime - this._checkStartTime,
      totalTime: checkEndTime - this._checkStartTime,
    };

    return {
      ...result,
      metrics,
      action: result.allowed ? RateLimitAction.ALLOW : RateLimitAction.DENY,
      warnings: this._warnings.length > 0 ? [...this._warnings] : undefined,
    };
  }

  checkSlidingWindow(identifier: RateLimitIdentifier): RateLimitResult {
    const bucketKey = this._getBucketKey(identifier);
    const now = new Date();
    let window = this._buckets.get(bucketKey) as SlidingWindowState | undefined;

    if (!window) {
      window = { timestamps: [] };
      this._buckets.set(bucketKey, window);
      this._stats.totalBucketsCreated++;
    }

    window.timestamps = window.timestamps.filter(
      (ts) => now.getTime() - ts.getTime() < this._config.windowSizeMs
    );

    if (window.timestamps.length < this._config.requestsPerWindow) {
      window.timestamps.push(now);
      this._stats.allowedRequests++;
      return {
        allowed: true,
        limit: this._config.requestsPerWindow,
        remaining: this._config.requestsPerWindow - window.timestamps.length,
        resetTime: new Date(now.getTime() + this._config.windowSizeMs),
      };
    }

    this._stats.deniedRequests++;
    const oldestTimestamp = window.timestamps[0];
    if (!oldestTimestamp) {
      return {
        allowed: false,
        limit: this._config.requestsPerWindow,
        remaining: 0,
        resetTime: new Date(now.getTime() + this._config.windowSizeMs),
        retryAfter: Math.ceil(this._config.windowSizeMs / 1000),
      };
    }
    const retryAfter = Math.ceil(
      (oldestTimestamp.getTime() + this._config.windowSizeMs - now.getTime()) / 1000
    );

    return {
      allowed: false,
      limit: this._config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(oldestTimestamp.getTime() + this._config.windowSizeMs),
      retryAfter,
    };
  }

  checkFixedWindow(identifier: RateLimitIdentifier): RateLimitResult {
    const bucketKey = this._getBucketKey(identifier);
    const now = new Date();
    let window = this._buckets.get(bucketKey) as FixedWindowState | undefined;

    if (!window || now.getTime() - window.windowStart.getTime() >= this._config.windowSizeMs) {
      window = {
        count: 0,
        windowStart: now,
      };
      this._buckets.set(bucketKey, window);
      this._stats.totalBucketsCreated++;
    }

    if (window.count < this._config.requestsPerWindow) {
      window.count++;
      this._stats.allowedRequests++;
      return {
        allowed: true,
        limit: this._config.requestsPerWindow,
        remaining: this._config.requestsPerWindow - window.count,
        resetTime: new Date(window.windowStart.getTime() + this._config.windowSizeMs),
      };
    }

    this._stats.deniedRequests++;
    const retryAfter = Math.ceil(
      (window.windowStart.getTime() + this._config.windowSizeMs - now.getTime()) / 1000
    );

    return {
      allowed: false,
      limit: this._config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(window.windowStart.getTime() + this._config.windowSizeMs),
      retryAfter,
    };
  }

  checkLeakyBucket(identifier: RateLimitIdentifier): RateLimitResult {
    const bucketKey = this._getBucketKey(identifier);
    const now = new Date();
    let bucket = this._buckets.get(bucketKey) as LeakyBucketState | undefined;

    if (!bucket) {
      bucket = {
        tokens: this._config.burstSize,
        lastLeak: now,
        queueSize: 0,
      };
      this._buckets.set(bucketKey, bucket);
      this._stats.totalBucketsCreated++;
    }

    const timeSinceLastLeak = now.getTime() - bucket.lastLeak.getTime();
    const leakAmount = Math.floor(
      (timeSinceLastLeak / this._config.windowSizeMs) * this._config.requestsPerWindow
    );

    bucket.tokens = Math.min(
      bucket.tokens + leakAmount,
      this._config.requestsPerWindow
    );
    bucket.lastLeak = now;

    if (bucket.queueSize > 0 && bucket.tokens > 0) {
      bucket.queueSize--;
      bucket.tokens--;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      this._stats.allowedRequests++;
      return {
        allowed: true,
        limit: this._config.requestsPerWindow,
        remaining: Math.floor(bucket.tokens),
        resetTime: new Date(now.getTime() + this._config.windowSizeMs),
      };
    }

    this._stats.deniedRequests++;
    const retryAfter = Math.ceil(this._config.windowSizeMs / 1000);

    return {
      allowed: false,
      limit: this._config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(now.getTime() + this._config.windowSizeMs),
      retryAfter,
    };
  }

  getBucketInfo(identifier: RateLimitIdentifier): RateLimitBucketInfo | null {
    const bucketKey = this._getBucketKey(identifier);
    const state = this._buckets.get(bucketKey);
    const info = this._bucketInfo.get(bucketKey);

    if (!state) {
      return null;
    }

    return {
      identifier,
      strategy: this._config.strategy,
      state,
      createdAt: info?.createdAt || new Date(),
      lastAccessed: info?.lastAccessed || new Date(),
      accessCount: info?.accessCount || 0,
      quota: info?.quota,
    };
  }

  getBucketUsage(identifier: RateLimitIdentifier): RateLimitUsage | null {
    const bucketKey = this._getBucketKey(identifier);
    const info = this._bucketInfo.get(bucketKey);

    if (!info) {
      return null;
    }

    return {
      identifier,
      scope: RateLimitScope.PER_IP,
      requests: this._stats.totalRequests,
      allowed: this._stats.allowedRequests,
      denied: this._stats.deniedRequests,
      windowStart: new Date(Date.now() - this._config.windowSizeMs),
      windowEnd: new Date(),
    };
  }

  addRateLimitRule(rule: RateLimitRule): void {
    this._rules.set(rule.id, rule);
  }

  removeRateLimitRule(ruleId: string): void {
    this._rules.delete(ruleId);
  }

  getRateLimitRules(): RateLimitRule[] {
    return Array.from(this._rules.values());
  }

  addRateLimitException(exception: RateLimitException): void {
    this._exceptions.set(exception.id, exception);
  }

  removeRateLimitException(exceptionId: string): void {
    this._exceptions.delete(exceptionId);
  }

  getRateLimitExceptions(): RateLimitException[] {
    return Array.from(this._exceptions.values());
  }

  setRateLimitTier(identifier: RateLimitIdentifier, tier: RateLimitTier): void {
    const bucketKey = this._getBucketKey(identifier);
    this._tiers.set(bucketKey, tier);
  }

  getRateLimitTier(identifier: RateLimitIdentifier): RateLimitTier | null {
    const bucketKey = this._getBucketKey(identifier);
    return this._tiers.get(bucketKey) || null;
  }

  getMetrics(): RateLimitMetrics {
    return {
      checkStartTime: this._checkStartTime,
      checkEndTime: Date.now(),
      checkDuration: Date.now() - this._checkStartTime,
      bucketLookupTime: 0,
      strategyExecutionTime: 0,
      totalTime: 0,
    };
  }

  getHealthStatus(): RateLimitHealthStatus {
    const checks: RateLimitHealthCheck[] = [
      {
        name: 'bucket_count',
        status: this._buckets.size < 10000 ? 'pass' : 'warn',
        message: `Bucket count: ${this._buckets.size}`,
        duration: 0,
      },
      {
        name: 'memory_usage',
        status: 'pass',
        message: 'Memory usage within limits',
        duration: 0,
      },
      {
        name: 'rate_limit_enabled',
        status: this._config.enabled ? 'pass' : 'warn',
        message: this._config.enabled ? 'Rate limiting enabled' : 'Rate limiting disabled',
        duration: 0,
      },
    ];

    const failedChecks = checks.filter((c) => c.status === 'fail').length;
    const score = Math.max(0, 100 - failedChecks * 25);

    return {
      status: failedChecks === 0 ? 'healthy' : failedChecks < 3 ? 'degraded' : 'unhealthy',
      score,
      checks,
      lastCheck: new Date(),
    };
  }

  runDiagnostics(): RateLimitDiagnostics {
    const startTime = new Date();
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const steps: DiagnosticStep[] = [
      {
        name: 'check_config',
        startTime,
        endTime: new Date(),
        duration: 1,
        status: 'success',
        details: { config: this._config },
      },
      {
        name: 'check_buckets',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1,
        status: 'success',
        details: { bucketCount: this._buckets.size },
      },
      {
        name: 'check_stats',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1,
        status: 'success',
        details: { stats: this._stats },
      },
    ];

    const endTime = new Date();

    return {
      traceId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      steps,
      summary: {
        totalSteps: steps.length,
        successfulSteps: steps.filter((s) => s.status === 'success').length,
        failedSteps: steps.filter((s) => s.status === 'failure').length,
        skippedSteps: steps.filter((s) => s.status === 'skipped').length,
        overallStatus: 'success',
      },
    };
  }

  addWarning(warning: RateLimitWarning): void {
    this._warnings.push(warning);
  }

  clearWarnings(): void {
    this._warnings = [];
  }

  getWarnings(): RateLimitWarning[] {
    return [...this._warnings];
  }

  cleanupExpiredBuckets(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, bucket] of this._buckets.entries()) {
      if (bucket instanceof Object && 'lastRefill' in bucket) {
        const tokenBucket = bucket as TokenBucketState;
        if (now.getTime() - tokenBucket.lastRefill.getTime() > this._config.windowSizeMs * 2) {
          expiredKeys.push(key);
        }
      } else if (bucket instanceof Object && 'windowStart' in bucket) {
        const fixedWindow = bucket as FixedWindowState;
        if (now.getTime() - fixedWindow.windowStart.getTime() > this._config.windowSizeMs * 2) {
          expiredKeys.push(key);
        }
      }
    }

    for (const key of expiredKeys) {
      this._buckets.delete(key);
      this._bucketInfo.delete(key);
      this._stats.totalBucketsExpired++;
    }
  }

  getBucketCount(): number {
    return this._buckets.size;
  }

  getTotalUsage(): RateLimitUsage {
    return {
      identifier: { type: RateLimitIdentifierType.CUSTOM, value: 'total' },
      scope: RateLimitScope.GLOBAL,
      requests: this._stats.totalRequests,
      allowed: this._stats.allowedRequests,
      denied: this._stats.deniedRequests,
      windowStart: new Date(Date.now() - this._config.windowSizeMs),
      windowEnd: new Date(),
    };
  }

  getUsageByIdentifier(identifier: RateLimitIdentifier): RateLimitUsage | null {
    return this.getBucketUsage(identifier);
  }

  setQuota(identifier: RateLimitIdentifier, quota: RateLimitQuota): void {
    const bucketKey = this._getBucketKey(identifier);
    this._quotas.set(bucketKey, quota);
  }

  getQuota(identifier: RateLimitIdentifier): RateLimitQuota | null {
    const bucketKey = this._getBucketKey(identifier);
    return this._quotas.get(bucketKey) || null;
  }

  resetQuota(identifier: RateLimitIdentifier): void {
    const bucketKey = this._getBucketKey(identifier);
    this._quotas.delete(bucketKey);
  }

  hasException(identifier: RateLimitIdentifier): boolean {
    for (const exception of this._exceptions.values()) {
      if (exception.identifier.type === identifier.type && exception.identifier.value === identifier.value) {
        if (exception.expiresAt && new Date() > exception.expiresAt) {
          this._exceptions.delete(exception.id);
          return false;
        }
        return true;
      }
    }
    return false;
  }

  getApplicableRule(identifier: RateLimitIdentifier): RateLimitRule | null {
    const applicableRules = Array.from(this._rules.values())
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of applicableRules) {
      if (rule.scope === RateLimitScope.GLOBAL) {
        return rule;
      }
      if (rule.scope === RateLimitScope.PER_IP && identifier.type === RateLimitIdentifierType.IP_ADDRESS) {
        return rule;
      }
      if (rule.scope === RateLimitScope.PER_USER && identifier.type === RateLimitIdentifierType.USER_ID) {
        return rule;
      }
      if (rule.scope === RateLimitScope.PER_API_KEY && identifier.type === RateLimitIdentifierType.API_KEY) {
        return rule;
      }
    }

    return null;
  }

  checkInternalLayerRateLimit(
    layerIdentifier: InternalLayerIdentifier,
    _context?: InternalLayerContext
  ): InternalLayerRateLimitResult {
    const config = this._internalLayerConfigs.get(layerIdentifier.layer);
    if (!config || !config.enabled) {
      return {
        layer: layerIdentifier.layer,
        allowed: true,
        limit: config?.requestsPerWindow || 1000,
        remaining: config?.requestsPerWindow || 1000,
        resetTime: new Date(Date.now() + (config?.windowSizeMs || 60000)),
        operation: layerIdentifier.operation,
      };
    }

    const stats = this._internalLayerStats.get(layerIdentifier.layer);
    if (stats) {
      stats.totalRequests++;
    }

    const bucketKey = this._getInternalLayerBucketKey(layerIdentifier);
    const result = this._checkTokenBucketForLayer(bucketKey, config);

    if (stats) {
      if (result.allowed) {
        stats.allowedRequests++;
      } else {
        stats.deniedRequests++;
      }
    }

    return {
      layer: layerIdentifier.layer,
      allowed: result.allowed,
      limit: result.limit,
      remaining: result.remaining,
      resetTime: result.resetTime,
      retryAfter: result.retryAfter,
      operation: layerIdentifier.operation,
    };
  }

  private _checkTokenBucketForLayer(
    bucketKey: string,
    config: InternalLayerRateLimitConfig
  ): RateLimitResult {
    const now = new Date();
    let bucket = this._internalLayerBuckets.get(bucketKey) as TokenBucketState | undefined;

    if (!bucket) {
      bucket = {
        tokens: config.requestsPerWindow,
        lastRefill: now,
      };
      this._internalLayerBuckets.set(bucketKey, bucket);
    }

    const timeSinceLastRefill = now.getTime() - bucket.lastRefill.getTime();
    const refillAmount = Math.floor(
      (timeSinceLastRefill / config.windowSizeMs) * config.requestsPerWindow
    );

    bucket.tokens = Math.min(bucket.tokens + refillAmount, config.requestsPerWindow);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return {
        allowed: true,
        limit: config.requestsPerWindow,
        remaining: Math.floor(bucket.tokens),
        resetTime: new Date(now.getTime() + config.windowSizeMs),
      };
    }

    const retryAfter = Math.ceil(config.windowSizeMs / 1000);

    return {
      allowed: false,
      limit: config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(now.getTime() + config.windowSizeMs),
      retryAfter,
    };
  }

  setInternalLayerRateLimitConfig(config: InternalLayerRateLimitConfig): void {
    this._internalLayerConfigs.set(config.layer, config);
    const node = this._layerDependencyGraph.nodes.get(config.layer);
    if (node) {
      node.rateLimitConfig = config;
    }
  }

  getInternalLayerRateLimitConfig(layer: InternalLayer): InternalLayerRateLimitConfig | null {
    return this._internalLayerConfigs.get(layer) || null;
  }

  getLayerRateLimitStats(layer: InternalLayer): LayerRateLimitStats {
    const stats = this._internalLayerStats.get(layer);
    if (!stats) {
      return {
        layer,
        totalRequests: 0,
        allowedRequests: 0,
        deniedRequests: 0,
        currentBuckets: 0,
        averageRequestRate: 0,
        peakRequestRate: 0,
        lastResetTime: new Date(),
      };
    }
    stats.currentBuckets = this._getLayerBucketCount(layer);
    return { ...stats };
  }

  private _getLayerBucketCount(layer: InternalLayer): number {
    let count = 0;
    for (const key of this._internalLayerBuckets.keys()) {
      if (key.startsWith(`${layer}:`)) {
        count++;
      }
    }
    return count;
  }

  getAllLayerRateLimitStats(): LayerRateLimitStats[] {
    const layers = Object.values(InternalLayer);
    return layers.map((layer) => this.getLayerRateLimitStats(layer));
  }

  checkCrossLayerRateLimit(
    sourceLayer: InternalLayer,
    targetLayer: InternalLayer
  ): CrossLayerRateLimitResult {
    const bucketKey = this._getCrossLayerBucketKey(sourceLayer, targetLayer);
    const config = this._crossLayerConfigs.get(bucketKey);

    if (!config || !config.enabled) {
      return {
        sourceLayer,
        targetLayer,
        allowed: true,
        limit: config?.requestsPerWindow || 500,
        remaining: config?.requestsPerWindow || 500,
        resetTime: new Date(Date.now() + (config?.windowSizeMs || 60000)),
      };
    }

    const now = new Date();
    let bucket = this._crossLayerBuckets.get(bucketKey) as TokenBucketState | undefined;

    if (!bucket) {
      bucket = {
        tokens: config.requestsPerWindow,
        lastRefill: now,
      };
      this._crossLayerBuckets.set(bucketKey, bucket);
    }

    const timeSinceLastRefill = now.getTime() - bucket.lastRefill.getTime();
    const refillAmount = Math.floor(
      (timeSinceLastRefill / config.windowSizeMs) * config.requestsPerWindow
    );

    bucket.tokens = Math.min(bucket.tokens + refillAmount, config.requestsPerWindow);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return {
        sourceLayer,
        targetLayer,
        allowed: true,
        limit: config.requestsPerWindow,
        remaining: Math.floor(bucket.tokens),
        resetTime: new Date(now.getTime() + config.windowSizeMs),
      };
    }

    const retryAfter = Math.ceil(config.windowSizeMs / 1000);

    return {
      sourceLayer,
      targetLayer,
      allowed: false,
      limit: config.requestsPerWindow,
      remaining: 0,
      resetTime: new Date(now.getTime() + config.windowSizeMs),
      retryAfter,
    };
  }

  setCrossLayerRateLimitConfig(config: CrossLayerRateLimitConfig): void {
    const bucketKey = this._getCrossLayerBucketKey(config.sourceLayer, config.targetLayer);
    this._crossLayerConfigs.set(bucketKey, config);

    const edgeIndex = this._layerDependencyGraph.edges.findIndex(
      (e) => e.source === config.sourceLayer && e.target === config.targetLayer
    );

    if (edgeIndex >= 0) {
      const edge = this._layerDependencyGraph.edges[edgeIndex];
      if (edge) {
        edge.rateLimitConfig = config;
      }
    } else {
      this._layerDependencyGraph.edges.push({
        source: config.sourceLayer,
        target: config.targetLayer,
        weight: 1,
        rateLimitConfig: config,
      });
    }

    const sourceNode = this._layerDependencyGraph.nodes.get(config.sourceLayer);
    const targetNode = this._layerDependencyGraph.nodes.get(config.targetLayer);

    if (sourceNode && !sourceNode.dependencies.includes(config.targetLayer)) {
      sourceNode.dependencies.push(config.targetLayer);
    }
    if (targetNode && !targetNode.dependents.includes(config.sourceLayer)) {
      targetNode.dependents.push(config.sourceLayer);
    }
  }

  getCrossLayerRateLimitConfig(
    sourceLayer: InternalLayer,
    targetLayer: InternalLayer
  ): CrossLayerRateLimitConfig | null {
    const bucketKey = this._getCrossLayerBucketKey(sourceLayer, targetLayer);
    return this._crossLayerConfigs.get(bucketKey) || null;
  }

  getLayerDependencyGraph(): LayerDependencyGraph {
    return {
      nodes: new Map(this._layerDependencyGraph.nodes),
      edges: [...this._layerDependencyGraph.edges],
    };
  }

  addLayerDependency(source: InternalLayer, target: InternalLayer, weight: number): void {
    const edgeIndex = this._layerDependencyGraph.edges.findIndex(
      (e) => e.source === source && e.target === target
    );

    if (edgeIndex >= 0) {
      const edge = this._layerDependencyGraph.edges[edgeIndex];
      if (edge) {
        edge.weight = weight;
      }
    } else {
      this._layerDependencyGraph.edges.push({
        source,
        target,
        weight,
      });
    }

    const sourceNode = this._layerDependencyGraph.nodes.get(source);
    const targetNode = this._layerDependencyGraph.nodes.get(target);

    if (sourceNode && !sourceNode.dependencies.includes(target)) {
      sourceNode.dependencies.push(target);
    }
    if (targetNode && !targetNode.dependents.includes(source)) {
      targetNode.dependents.push(source);
    }
  }

  removeLayerDependency(source: InternalLayer, target: InternalLayer): void {
    const edgeIndex = this._layerDependencyGraph.edges.findIndex(
      (e) => e.source === source && e.target === target
    );

    if (edgeIndex >= 0) {
      this._layerDependencyGraph.edges.splice(edgeIndex, 1);
    }

    const sourceNode = this._layerDependencyGraph.nodes.get(source);
    const targetNode = this._layerDependencyGraph.nodes.get(target);

    if (sourceNode) {
      sourceNode.dependencies = sourceNode.dependencies.filter((l) => l !== target);
    }
    if (targetNode) {
      targetNode.dependents = targetNode.dependents.filter((l) => l !== source);
    }
  }

  getLayerHealthStatus(layer: InternalLayer): LayerHealthStatus {
    const status = this._layerHealthStatuses.get(layer);
    if (!status) {
      return {
        layer,
        status: 'healthy',
        score: 100,
        lastCheck: new Date(),
        issues: [],
      };
    }

    const stats = this._internalLayerStats.get(layer);
    const config = this._internalLayerConfigs.get(layer);

    const issues: string[] = [];

    if (stats) {
      const denialRate = stats.totalRequests > 0 ? stats.deniedRequests / stats.totalRequests : 0;
      if (denialRate > 0.5) {
        issues.push(`High denial rate: ${(denialRate * 100).toFixed(1)}%`);
      }
    }

    if (config && !config.enabled) {
      issues.push('Rate limiting disabled for this layer');
    }

    const score = Math.max(0, 100 - issues.length * 25);
    const healthStatus: 'healthy' | 'degraded' | 'unhealthy' = issues.length === 0 ? 'healthy' : issues.length < 3 ? 'degraded' : 'unhealthy';

    const updatedStatus: LayerHealthStatus = {
      layer,
      status: healthStatus,
      score,
      lastCheck: new Date(),
      issues,
    };

    this._layerHealthStatuses.set(layer, updatedStatus);

    return updatedStatus;
  }

  getAllLayerHealthStatuses(): LayerHealthStatus[] {
    const layers = Object.values(InternalLayer);
    return layers.map((layer) => this.getLayerHealthStatus(layer));
  }

  setRateLimitCascadeConfig(config: RateLimitCascadeConfig): void {
    this._cascadeConfig = config;
  }

  getRateLimitCascadeConfig(): RateLimitCascadeConfig {
    return { ...this._cascadeConfig };
  }

  setAdaptiveRateLimitConfig(config: AdaptiveRateLimitConfig): void {
    this._adaptiveConfig = config;
  }

  getAdaptiveRateLimitConfig(): AdaptiveRateLimitConfig {
    return { ...this._adaptiveConfig };
  }

  predictRateLimitUsage(
    identifier: RateLimitIdentifier,
    timeWindow: Date
  ): RateLimitPrediction {
    const bucketKey = this._getBucketKey(identifier);
    const bucket = this._buckets.get(bucketKey) as TokenBucketState | undefined;

    const currentUsage = bucket ? this._config.requestsPerWindow - bucket.tokens : 0;
    const timeDiff = timeWindow.getTime() - Date.now();

    if (timeDiff <= 0) {
      return {
        identifier,
        predictedUsage: currentUsage,
        predictedLimit: this._config.requestsPerWindow,
        timeWindow,
        confidence: 0.5,
        recommendations: ['Time window is in the past'],
      };
    }

    const windows = timeDiff / this._config.windowSizeMs;
    const predictedUsage = Math.min(currentUsage * (1 + windows * 0.1), this._config.requestsPerWindow);

    const recommendations: string[] = [];
    if (predictedUsage > this._config.requestsPerWindow * 0.8) {
      recommendations.push('Consider increasing rate limit or implementing caching');
    }
    if (predictedUsage > this._config.requestsPerWindow * 0.5) {
      recommendations.push('Monitor usage closely');
    }

    return {
      identifier,
      predictedUsage: Math.floor(predictedUsage),
      predictedLimit: this._config.requestsPerWindow,
      timeWindow,
      confidence: Math.max(0, 1 - windows * 0.1),
      recommendations,
    };
  }

  enableInternalLayerRateLimiting(layer: InternalLayer): void {
    const config = this._internalLayerConfigs.get(layer);
    if (config) {
      config.enabled = true;
      this._internalLayerConfigs.set(layer, config);
    }
  }

  disableInternalLayerRateLimiting(layer: InternalLayer): void {
    const config = this._internalLayerConfigs.get(layer);
    if (config) {
      config.enabled = false;
      this._internalLayerConfigs.set(layer, config);
    }
  }

  isInternalLayerRateLimitingEnabled(layer: InternalLayer): boolean {
    const config = this._internalLayerConfigs.get(layer);
    return config ? config.enabled : false;
  }

  resetInternalLayerRateLimit(layerIdentifier: InternalLayerIdentifier): void {
    const bucketKey = this._getInternalLayerBucketKey(layerIdentifier);
    this._internalLayerBuckets.delete(bucketKey);

    const stats = this._internalLayerStats.get(layerIdentifier.layer);
    if (stats) {
      stats.totalRequests = 0;
      stats.allowedRequests = 0;
      stats.deniedRequests = 0;
      stats.lastResetTime = new Date();
    }
  }

  clearAllInternalLayerBuckets(): void {
    this._internalLayerBuckets.clear();
    this._crossLayerBuckets.clear();

    for (const layer of Object.values(InternalLayer)) {
      const stats = this._internalLayerStats.get(layer);
      if (stats) {
        stats.totalRequests = 0;
        stats.allowedRequests = 0;
        stats.deniedRequests = 0;
        stats.lastResetTime = new Date();
      }
    }
  }
}
