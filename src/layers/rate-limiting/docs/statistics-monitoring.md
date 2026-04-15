# Statistics and Monitoring

## Overview
The Rate Limiting Layer includes comprehensive statistics tracking and health monitoring to provide visibility into rate limiting behavior, system performance, and operational metrics.

## Statistics Tracking

### Statistics Structure
```typescript
interface RateLimitStatistics {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  currentBuckets: number;
  totalBucketsCreated: number;
  totalBucketsExpired: number;
  averageRequestRate: number;
  peakRequestRate: number;
  deniedByReason: Map<string, number>;
  requestsByScope: Map<RateLimitScope, number>;
  requestsByStrategy: Map<RateLimitStrategy, number>;
  lastResetTime: Date;
}
```

### Statistics Collector
```typescript
class StatisticsCollector {
  private stats: RateLimitStatistics;
  
  recordRequest(allowed: boolean, reason?: string): void {
    this.stats.totalRequests++;
    
    if (allowed) {
      this.stats.allowedRequests++;
    } else {
      this.stats.deniedRequests++;
      
      if (reason) {
        const count = this.stats.deniedByReason.get(reason) || 0;
        this.stats.deniedByReason.set(reason, count + 1);
      }
    }
    
    this.updateRequestRate();
  }
  
  recordBucketCreated(): void {
    this.stats.totalBucketsCreated++;
    this.stats.currentBuckets++;
  }
  
  recordBucketExpired(): void {
    this.stats.totalBucketsExpired++;
    this.stats.currentBuckets--;
  }
  
  recordScopeUsed(scope: RateLimitScope): void {
    const count = this.stats.requestsByScope.get(scope) || 0;
    this.stats.requestsByScope.set(scope, count + 1);
  }
  
  recordStrategyUsed(strategy: RateLimitStrategy): void {
    const count = this.stats.requestsByStrategy.get(strategy) || 0;
    this.stats.requestsByStrategy.set(strategy, count + 1);
  }
  
  private updateRequestRate(): void {
    const now = Date.now();
    const elapsed = (now - this.stats.lastResetTime.getTime()) / 1000;
    
    if (elapsed > 0) {
      const rate = this.stats.totalRequests / elapsed;
      this.stats.averageRequestRate = rate;
      
      if (rate > this.stats.peakRequestRate) {
        this.stats.peakRequestRate = rate;
      }
    }
  }
  
  getStatistics(): RateLimitStatistics {
    return { ...this.stats };
  }
  
  resetStatistics(): void {
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      currentBuckets: 0,
      totalBucketsCreated: 0,
      totalBucketsExpired: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      deniedByReason: new Map(),
      requestsByScope: new Map(),
      requestsByStrategy: new Map(),
      lastResetTime: new Date()
    };
  }
}
```

### Per-Identifier Statistics
```typescript
interface IdentifierStatistics {
  identifier: string;
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  firstSeen: Date;
  lastSeen: Date;
  currentBucketTokens?: number;
  quotaUsage?: number;
}

class IdentifierStatisticsTracker {
  private stats: Map<string, IdentifierStatistics> = new Map();
  
  recordRequest(identifier: string, allowed: boolean): void {
    const now = new Date();
    let stat = this.stats.get(identifier);
    
    if (!stat) {
      stat = {
        identifier,
        totalRequests: 0,
        allowedRequests: 0,
        deniedRequests: 0,
        firstSeen: now,
        lastSeen: now
      };
      this.stats.set(identifier, stat);
    }
    
    stat.totalRequests++;
    stat.lastSeen = now;
    
    if (allowed) {
      stat.allowedRequests++;
    } else {
      stat.deniedRequests++;
    }
  }
  
  updateBucketTokens(identifier: string, tokens: number): void {
    const stat = this.stats.get(identifier);
    if (stat) {
      stat.currentBucketTokens = tokens;
    }
  }
  
  updateQuotaUsage(identifier: string, usage: number): void {
    const stat = this.stats.get(identifier);
    if (stat) {
      stat.quotaUsage = usage;
    }
  }
  
  getStatistics(identifier: string): IdentifierStatistics | undefined {
    return this.stats.get(identifier);
  }
  
  getAllStatistics(): IdentifierStatistics[] {
    return Array.from(this.stats.values());
  }
  
  cleanupInactive(maxAge: number): void {
    const now = Date.now();
    const maxAgeMs = maxAge * 1000;
    
    for (const [identifier, stat] of this.stats) {
      if (now - stat.lastSeen.getTime() > maxAgeMs) {
        this.stats.delete(identifier);
      }
    }
  }
}
```

## Health Monitoring

### Health Status
```typescript
enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

interface HealthCheckResult {
  status: HealthStatus;
  score: number;
  checks: HealthCheck[];
  timestamp: Date;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration: number;
  details?: any;
}
```

### Health Checker
```typescript
class HealthChecker {
  async checkHealth(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];
    let score = 100;
    
    // Check bucket count
    const bucketCheck = await this.checkBucketCount();
    checks.push(bucketCheck);
    if (bucketCheck.status === 'fail') score -= 30;
    if (bucketCheck.status === 'warn') score -= 10;
    
    // Check memory usage
    const memoryCheck = await this.checkMemoryUsage();
    checks.push(memoryCheck);
    if (memoryCheck.status === 'fail') score -= 30;
    if (memoryCheck.status === 'warn') score -= 10;
    
    // Check rate limiter enabled status
    const enabledCheck = await this.checkEnabledStatus();
    checks.push(enabledCheck);
    if (enabledCheck.status === 'fail') score -= 20;
    
    // Check statistics
    const statsCheck = await this.checkStatistics();
    checks.push(statsCheck);
    if (statsCheck.status === 'fail') score -= 10;
    
    // Determine overall status
    let status: HealthStatus;
    if (score >= 90) status = HealthStatus.HEALTHY;
    else if (score >= 70) status = HealthStatus.DEGRADED;
    else status = HealthStatus.UNHEALTHY;
    
    return {
      status,
      score,
      checks,
      timestamp: new Date()
    };
  }
  
  private async checkBucketCount(): Promise<HealthCheck> {
    const start = Date.now();
    const bucketCount = this.rateLimiter.getBucketCount();
    const duration = Date.now() - start;
    
    if (bucketCount > this.config.maxBucketCount) {
      return {
        name: 'bucket-count',
        status: 'fail',
        duration,
        details: { bucketCount, maxBucketCount: this.config.maxBucketCount }
      };
    }
    
    if (bucketCount > this.config.maxBucketCount * 0.8) {
      return {
        name: 'bucket-count',
        status: 'warn',
        duration,
        details: { bucketCount, maxBucketCount: this.config.maxBucketCount }
      };
    }
    
    return {
      name: 'bucket-count',
      status: 'pass',
      duration,
      details: { bucketCount }
    };
  }
  
  private async checkMemoryUsage(): Promise<HealthCheck> {
    const start = Date.now();
    const memoryUsage = process.memoryUsage();
    const duration = Date.now() - start;
    
    const usedMB = memoryUsage.heapUsed / 1024 / 1024;
    const maxMB = this.config.maxMemoryMB;
    
    if (usedMB > maxMB) {
      return {
        name: 'memory-usage',
        status: 'fail',
        duration,
        details: { usedMB, maxMB }
      };
    }
    
    if (usedMB > maxMB * 0.8) {
      return {
        name: 'memory-usage',
        status: 'warn',
        duration,
        details: { usedMB, maxMB }
      };
    }
    
    return {
      name: 'memory-usage',
      status: 'pass',
      duration,
      details: { usedMB }
    };
  }
  
  private async checkEnabledStatus(): Promise<HealthCheck> {
    const start = Date.now();
    const enabled = this.rateLimiter.isEnabled();
    const duration = Date.now() - start;
    
    if (!enabled) {
      return {
        name: 'enabled-status',
        status: 'fail',
        duration,
        details: { enabled }
      };
    }
    
    return {
      name: 'enabled-status',
      status: 'pass',
      duration,
      details: { enabled }
    };
  }
  
  private async checkStatistics(): Promise<HealthCheck> {
    const start = Date.now();
    const stats = this.statisticsCollector.getStatistics();
    const duration = Date.now() - start;
    
    // Check denial rate
    const denialRate = stats.deniedRequests / stats.totalRequests;
    if (denialRate > 0.5) {
      return {
        name: 'statistics',
        status: 'warn',
        duration,
        details: { denialRate }
      };
    }
    
    return {
      name: 'statistics',
      status: 'pass',
      duration,
      details: stats
    };
  }
}
```

## Diagnostics

### Trace ID Generation
```typescript
class TraceIdGenerator {
  generate(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }
}
```

### Diagnostic Execution
```typescript
class DiagnosticRunner {
  async runDiagnostics(request: HttpRequest): Promise<DiagnosticResult> {
    const traceId = this.traceIdGenerator.generate();
    const steps: DiagnosticStep[] = [];
    
    // Step 1: Identifier resolution
    steps.push(await this.diagnoseIdentifierResolution(request, traceId));
    
    // Step 2: Scope resolution
    steps.push(await this.diagnoseScopeResolution(request, traceId));
    
    // Step 3: Rule evaluation
    steps.push(await this.diagnoseRuleEvaluation(request, traceId));
    
    // Step 4: Exception check
    steps.push(await this.diagnoseExceptionCheck(request, traceId));
    
    // Step 5: Tier resolution
    steps.push(await this.diagnoseTierResolution(request, traceId));
    
    // Step 6: Rate limit check
    steps.push(await this.diagnoseRateLimitCheck(request, traceId));
    
    // Step 7: Statistics verification
    steps.push(await this.diagnoseStatistics(traceId));
    
    return {
      traceId,
      steps,
      timestamp: new Date()
    };
  }
  
  private async diagnoseIdentifierResolution(request: HttpRequest, traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const identifier = await this.identifierResolver.resolve(request);
      return {
        name: 'identifier-resolution',
        status: 'pass',
        duration: Date.now() - start,
        details: { identifier, traceId }
      };
    } catch (error) {
      return {
        name: 'identifier-resolution',
        status: 'fail',
        duration: Date.now() - start,
        details: { error, traceId }
      };
    }
  }
  
  private async diagnoseScopeResolution(request: HttpRequest, traceId: string): Promise<DiagnosticStep> {
    const start = Date.now();
    
    try {
      const scope = this.scopeResolver.resolve(request, this.config);
      return {
        name: 'scope-resolution',
        status: 'pass',
        duration: Date.now() - start,
        details: { scope, traceId }
      };
    } catch (error) {
      return {
        name: 'scope-resolution',
        status: 'fail',
        duration: Date.now() - start,
        details: { error, traceId }
      };
    }
  }
  
  // ... other diagnostic steps
}

interface DiagnosticStep {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration: number;
  details: any;
}

interface DiagnosticResult {
  traceId: string;
  steps: DiagnosticStep[];
  timestamp: Date;
}
```

### Configuration Validation
```typescript
class ConfigValidator {
  validate(config: RateLimitConfig): ValidationResult {
    const errors: string[] = [];
    
    // Validate maxRequests
    if (config.maxRequests <= 0) {
      errors.push('maxRequests must be positive');
    }
    
    // Validate windowMs
    if (config.windowMs <= 0) {
      errors.push('windowMs must be positive');
    }
    
    // Validate burstSize
    if (config.burstSize !== undefined && config.burstSize < 0) {
      errors.push('burstSize cannot be negative');
    }
    
    // Validate strategy
    if (!Object.values(RateLimitStrategy).includes(config.strategy)) {
      errors.push('Invalid rate limit strategy');
    }
    
    // Validate grace period
    if (config.gracePeriodMs !== undefined && config.gracePeriodMs < 0) {
      errors.push('gracePeriodMs cannot be negative');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### Bucket State Inspection
```typescript
class BucketInspector {
  inspectBucket(identifier: string): BucketState {
    const bucket = this.rateLimiter.getBucket(identifier);
    
    if (!bucket) {
      return {
        exists: false,
        identifier,
        state: null
      };
    }
    
    return {
      exists: true,
      identifier,
      state: {
        tokens: bucket.tokens,
        capacity: bucket.capacity,
        lastRefill: bucket.lastRefill,
        strategy: bucket.strategy
      }
    };
  }
  
  inspectAllBuckets(): BucketState[] {
    const identifiers = this.rateLimiter.getAllIdentifiers();
    return identifiers.map(id => this.inspectBucket(id));
  }
  
  inspectActiveBuckets(): BucketState[] {
    const buckets = this.inspectAllBuckets();
    const now = Date.now();
    const activeThreshold = 60000; // 1 minute
    
    return buckets.filter(b => {
      if (!b.exists || !b.state) return false;
      return (now - b.state.lastRefill) < activeThreshold;
    });
  }
}

interface BucketState {
  exists: boolean;
  identifier: string;
  state: {
    tokens: number;
    capacity: number;
    lastRefill: number;
    strategy: RateLimitStrategy;
  } | null;
}
```

## Monitoring Metrics

### Key Metrics
```typescript
interface MonitoringMetrics {
  requestRate: number;
  denialRate: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  bucketUtilization: number;
  memoryUsage: number;
  activeIdentifiers: number;
  ruleEffectiveness: Map<string, number>;
}

class MetricsCollector {
  collectMetrics(): MonitoringMetrics {
    const stats = this.statisticsCollector.getStatistics();
    const now = Date.now();
    
    return {
      requestRate: this.calculateRequestRate(stats),
      denialRate: this.calculateDenialRate(stats),
      averageLatency: this.calculateAverageLatency(),
      p95Latency: this.calculatePercentileLatency(95),
      p99Latency: this.calculatePercentileLatency(99),
      bucketUtilization: this.calculateBucketUtilization(),
      memoryUsage: this.getMemoryUsage(),
      activeIdentifiers: this.getActiveIdentifierCount(),
      ruleEffectiveness: this.calculateRuleEffectiveness()
    };
  }
  
  private calculateRequestRate(stats: RateLimitStatistics): number {
    const elapsed = (Date.now() - stats.lastResetTime.getTime()) / 1000;
    return elapsed > 0 ? stats.totalRequests / elapsed : 0;
  }
  
  private calculateDenialRate(stats: RateLimitStatistics): number {
    return stats.totalRequests > 0 
      ? stats.deniedRequests / stats.totalRequests 
      : 0;
  }
  
  // ... other metric calculations
}
```

## Best Practices

### Statistics Collection
- Collect statistics at appropriate granularity
- Provide both aggregate and detailed statistics
- Implement efficient storage for large datasets
- Regularly clean up old statistics
- Provide statistics export functionality

### Health Monitoring
- Run health checks regularly
- Set appropriate thresholds for alerts
- Monitor health trends over time
- Implement automated recovery actions
- Log health check results

### Diagnostics
- Use unique trace IDs for request tracking
- Provide step-by-step diagnostic information
- Include timing information for each step
- Log diagnostic results for analysis
- Implement diagnostic data retention policies
