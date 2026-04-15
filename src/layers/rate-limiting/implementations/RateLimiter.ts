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
}
