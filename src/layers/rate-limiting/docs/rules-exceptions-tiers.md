# Rules, Exceptions, and Tiers

## Overview
The Rate Limiting Layer includes advanced features for rule-based rate limiting, exception handling, and tiered rate limits to support complex business requirements and flexible access control.

## Rule-Based Rate Limiting

### Rate Limit Rules
```typescript
interface RateLimitRule {
  id: string;
  name: string;
  priority: number;
  scope: RateLimitScope;
  scopePattern?: string;
  identifierPattern?: string;
  maxRequests: number;
  windowMs: number;
  strategy: RateLimitStrategy;
  conditions?: RuleCondition[];
  enabled: boolean;
}

interface RuleCondition {
  type: 'header' | 'method' | 'path' | 'custom';
  field: string;
  operator: 'equals' | 'contains' | 'matches' | 'custom';
  value: any;
  evaluate?(context: any): boolean;
}
```

### Rule Engine
```typescript
class RuleEngine {
  private rules: RateLimitRule[] = [];
  
  addRule(rule: RateLimitRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }
  
  async evaluateRules(request: HttpRequest): Promise<RateLimitResult> {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      if (await this.matchesRule(request, rule)) {
        return await this.applyRule(request, rule);
      }
    }
    
    return this.applyDefaultLimit(request);
  }
  
  private async matchesRule(request: HttpRequest, rule: RateLimitRule): Promise<boolean> {
    // Check scope pattern
    if (rule.scopePattern && !this.matchesPattern(request.uri, rule.scopePattern)) {
      return false;
    }
    
    // Check identifier pattern
    if (rule.identifierPattern) {
      const identifier = await this.resolveIdentifier(request);
      if (!this.matchesPattern(identifier, rule.identifierPattern)) {
        return false;
      }
    }
    
    // Check conditions
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        if (!await this.evaluateCondition(request, condition)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  private async evaluateCondition(request: HttpRequest, condition: RuleCondition): Promise<boolean> {
    switch (condition.type) {
      case 'header':
        const headerValue = request.headers.get(condition.field);
        return this.compareValues(headerValue, condition.value, condition.operator);
      
      case 'method':
        return this.compareValues(request.method, condition.value, condition.operator);
      
      case 'path':
        return this.compareValues(request.uri, condition.value, condition.operator);
      
      case 'custom':
        return condition.evaluate?.({ request }) ?? true;
      
      default:
        return false;
    }
  }
  
  private compareValues(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'contains':
        return actual?.includes?.(expected) ?? false;
      case 'matches':
        return new RegExp(expected).test(actual);
      default:
        return false;
    }
  }
}
```

### Dynamic Rule Management
```typescript
class RuleManager {
  private rules: Map<string, RateLimitRule> = new Map();
  
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.id, rule);
    this.auditLogger.logRuleAdded(rule);
  }
  
  updateRule(ruleId: string, updates: Partial<RateLimitRule>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      const updated = { ...rule, ...updates };
      this.rules.set(ruleId, updated);
      this.auditLogger.logRuleUpdated(updated);
    }
  }
  
  deleteRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.auditLogger.logRuleDeleted(ruleId);
  }
  
  getRule(ruleId: string): RateLimitRule | undefined {
    return this.rules.get(ruleId);
  }
  
  getAllRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }
  
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }
  
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }
}
```

## Exception Handling

### Rate Limit Exceptions
```typescript
interface RateLimitException {
  id: string;
  identifier: string;
  type: 'temporary' | 'permanent';
  expiresAt?: Date;
  reason: string;
  createdAt: Date;
  createdBy: string;
}
```

### Exception Manager
```typescript
class ExceptionManager {
  private exceptions: Map<string, RateLimitException> = new Map();
  
  addException(exception: RateLimitException): void {
    const key = this.getExceptionKey(exception.identifier);
    this.exceptions.set(key, exception);
    this.auditLogger.logExceptionAdded(exception);
  }
  
  removeException(identifier: string): void {
    const key = this.getExceptionKey(identifier);
    this.exceptions.delete(key);
    this.auditLogger.logExceptionRemoved(identifier);
  }
  
  hasException(identifier: string): boolean {
    const key = this.getExceptionKey(identifier);
    const exception = this.exceptions.get(key);
    
    if (!exception) return false;
    
    // Check if expired
    if (exception.type === 'temporary' && exception.expiresAt) {
      if (exception.expiresAt < new Date()) {
        this.removeException(identifier);
        return false;
      }
    }
    
    return true;
  }
  
  private getExceptionKey(identifier: string): string {
    return `exception:${identifier}`;
  }
  
  cleanupExpiredExceptions(): void {
    const now = new Date();
    for (const [key, exception] of this.exceptions) {
      if (exception.type === 'temporary' && exception.expiresAt && exception.expiresAt < now) {
        this.exceptions.delete(key);
      }
    }
  }
}
```

### Exception Application
```typescript
class ExceptionAwareRateLimiter {
  async checkLimit(request: HttpRequest): Promise<RateLimitResult> {
    const identifier = await this.resolveIdentifier(request);
    
    // Check for exception
    if (this.exceptionManager.hasException(identifier.value)) {
      return {
        allowed: true,
        remaining: Infinity,
        resetTime: new Date(Date.now() + this.config.windowMs),
        exception: true
      };
    }
    
    // Apply normal rate limiting
    return await this.rateLimiter.checkLimit(identifier);
  }
}
```

## Tiered Rate Limits

### Tier Configuration
```typescript
interface RateLimitTier {
  id: string;
  name: string;
  priority: number;
  maxRequests: number;
  windowMs: number;
  features: string[];
  conditions?: TierCondition[];
}

interface TierCondition {
  type: 'user_role' | 'subscription_level' | 'custom';
  field: string;
  operator: 'equals' | 'in' | 'custom';
  value: any;
}
```

### Tier Manager
```typescript
class TierManager {
  private tiers: RateLimitTier[] = [];
  
  addTier(tier: RateLimitTier): void {
    this.tiers.push(tier);
    this.tiers.sort((a, b) => b.priority - a.priority);
  }
  
  async resolveTier(request: HttpRequest): Promise<RateLimitTier | null> {
    for (const tier of this.tiers) {
      if (await this.matchesTier(request, tier)) {
        return tier;
      }
    }
    return null;
  }
  
  private async matchesTier(request: HttpRequest, tier: RateLimitTier): Promise<boolean> {
    if (!tier.conditions) return true;
    
    for (const condition of tier.conditions) {
      if (!await this.evaluateCondition(request, condition)) {
        return false;
      }
    }
    
    return true;
  }
  
  private async evaluateCondition(request: HttpRequest, condition: TierCondition): Promise<boolean> {
    switch (condition.type) {
      case 'user_role':
        const userRoles = request.securityContext?.roles || [];
        if (condition.operator === 'in') {
          return condition.value.some((role: string) => userRoles.includes(role));
        }
        return userRoles.includes(condition.value);
      
      case 'subscription_level':
        const subscription = request.securityContext?.subscriptionLevel;
        return subscription === condition.value;
      
      case 'custom':
        return condition.value?.({ request }) ?? true;
      
      default:
        return false;
    }
  }
}
```

### Tier-Based Rate Limiting
```typescript
class TieredRateLimiter {
  async checkLimit(request: HttpRequest): Promise<RateLimitResult> {
    const tier = await this.tierManager.resolveTier(request);
    
    if (tier) {
      const config = {
        maxRequests: tier.maxRequests,
        windowMs: tier.windowMs
      };
      return await this.rateLimiter.checkLimitWithConfig(request, config);
    }
    
    // Apply default limits
    return await this.rateLimiter.checkLimit(request);
  }
}
```

## Quota Management

### Quota Configuration
```typescript
interface Quota {
  identifier: string;
  maxRequests: number;
  usedRequests: number;
  windowStart: Date;
  windowEnd: Date;
  resetAt: Date;
}
```

### Quota Manager
```typescript
class QuotaManager {
  private quotas: Map<string, Quota> = new Map();
  
  async checkQuota(identifier: string): Promise<QuotaResult> {
    const now = new Date();
    let quota = this.quotas.get(identifier);
    
    // Create or reset quota
    if (!quota || quota.windowEnd < now) {
      quota = this.createQuota(identifier);
      this.quotas.set(identifier, quota);
    }
    
    // Check if quota exceeded
    if (quota.usedRequests >= quota.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: quota.resetAt,
        quota: quota
      };
    }
    
    // Increment usage
    quota.usedRequests++;
    
    return {
      allowed: true,
      remaining: quota.maxRequests - quota.usedRequests,
      resetTime: quota.resetAt,
      quota: quota
    };
  }
  
  private createQuota(identifier: string): Quota {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.config.windowMs);
    
    return {
      identifier,
      maxRequests: this.config.maxRequests,
      usedRequests: 0,
      windowStart: now,
      windowEnd,
      resetAt: windowEnd
    };
  }
  
  resetQuota(identifier: string): void {
    this.quotas.delete(identifier);
  }
  
  getQuota(identifier: string): Quota | undefined {
    return this.quotas.get(identifier);
  }
  
  getAllQuotas(): Quota[] {
    return Array.from(this.quotas.values());
  }
}
```

## Warning System

### Warning Configuration
```typescript
enum WarningLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

interface RateLimitWarning {
  identifier: string;
  level: WarningLevel;
  count: number;
  timestamp: Date;
  message: string;
}
```

### Warning Manager
```typescript
class WarningManager {
  private warnings: Map<string, RateLimitWarning[]> = new Map();
  
  addWarning(identifier: string, level: WarningLevel, message: string): void {
    const key = this.getWarningKey(identifier);
    const warnings = this.warnings.get(key) || [];
    
    warnings.push({
      identifier,
      level,
      count: warnings.length + 1,
      timestamp: new Date(),
      message
    });
    
    this.warnings.set(key, warnings);
  }
  
  getWarnings(identifier: string): RateLimitWarning[] {
    const key = this.getWarningKey(identifier);
    return this.warnings.get(key) || [];
  }
  
  clearWarnings(identifier: string): void {
    const key = this.getWarningKey(identifier);
    this.warnings.delete(key);
  }
  
  getWarningCount(identifier: string, level?: WarningLevel): number {
    const warnings = this.getWarnings(identifier);
    
    if (level) {
      return warnings.filter(w => w.level === level).length;
    }
    
    return warnings.length;
  }
  
  private getWarningKey(identifier: string): string {
    return `warning:${identifier}`;
  }
}
```

### Warning Integration
```typescript
class WarningAwareRateLimiter {
  async checkLimit(request: HttpRequest): Promise<RateLimitResult> {
    const identifier = await this.resolveIdentifier(request);
    const result = await this.rateLimiter.checkLimit(identifier);
    
    // Add warning if approaching limit
    const threshold = this.config.warningThreshold;
    if (result.allowed && result.remaining <= threshold) {
      const level = this.calculateWarningLevel(result.remaining);
      this.warningManager.addWarning(
        identifier.value,
        level,
        `Rate limit approaching: ${result.remaining} requests remaining`
      );
    }
    
    return {
      ...result,
      warnings: this.warningManager.getWarnings(identifier.value)
    };
  }
  
  private calculateWarningLevel(remaining: number): WarningLevel {
    if (remaining <= this.config.criticalThreshold) {
      return WarningLevel.HIGH;
    }
    if (remaining <= this.config.warningThreshold) {
      return WarningLevel.MEDIUM;
    }
    return WarningLevel.LOW;
  }
}
```

## Best Practices

### Rule Management
- Use descriptive rule names and IDs
- Set appropriate priorities for rule evaluation
- Document rule conditions clearly
- Regularly review and update rules
- Monitor rule effectiveness

### Exception Management
- Use exceptions sparingly for legitimate cases
- Document the reason for each exception
- Set appropriate expiration for temporary exceptions
- Regularly audit and clean up exceptions
- Monitor exception usage patterns

### Tier Management
- Design tiers based on business requirements
- Use clear tier naming conventions
- Set appropriate priorities for tier selection
- Document tier conditions clearly
- Monitor tier distribution and usage

### Quota Management
- Set appropriate quota limits based on capacity
- Monitor quota usage patterns
- Implement quota reset notifications
- Provide quota usage information to users
- Consider grace periods for quota exhaustion
