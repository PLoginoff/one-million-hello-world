# Rules, Exceptions, and Tiers

## Overview
Rule matching, exceptions, tiers, quotas, and warnings are managed by `RateLimiter` methods (`addRateLimitRule`, `addRateLimitException`, `setRateLimitTier`, `setQuota`, `addWarning`) against the types in `types/rate-limiting-types.ts`. There are no separate `RuleEngine`/`ExceptionManager`/`TierManager`/`QuotaManager`/`WarningManager` classes — evaluation happens inside `checkRateLimit`/`checkRateLimitExtended`.

## Rules

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

Rules are evaluated in descending `priority`; the first enabled rule matching `scopePattern`, `identifierPattern`, and all `conditions` wins. Condition operators: `equals`, `contains`, `matches` (regex), or `custom` via `evaluate(context)`.

```typescript
limiter.addRateLimitRule(rule);
limiter.removeRateLimitRule(ruleId);
limiter.getRateLimitRules();
limiter.getApplicableRule(identifier);   // which rule would apply
```

## Exceptions

```typescript
interface RateLimitException {
  id: string;
  identifier: string;
  type: 'temporary' | 'permanent';
  expiresAt?: Date;      // required for 'temporary'
  reason: string;
  createdAt: Date;
  createdBy: string;
}
```

An identifier with an active exception bypasses limits (`allowed: true`). Temporary exceptions expire at `expiresAt`.

```typescript
limiter.addRateLimitException(exception);
limiter.removeRateLimitException(exceptionId);
limiter.getRateLimitExceptions();
limiter.hasException(identifier);   // checks expiry
```

## Tiers

```typescript
interface RateLimitTier {
  id: string;
  name: string;
  priority: number;
  maxRequests: number;
  windowMs: number;
  features: string[];
  conditions?: TierCondition[];   // 'user_role' | 'subscription_level' | 'custom'
}
```

Tiers give identifiers their own `maxRequests`/`windowMs`. Resolve order: `priority` desc; `conditions` filter by role/subscription/custom.

```typescript
limiter.setRateLimitTier(identifier, tier);
limiter.getRateLimitTier(identifier);  // RateLimitTier | null
```

## Quotas

`RateLimitQuota` caps total requests per identifier in a window, independent of bucket strategy.

```typescript
limiter.setQuota(identifier, quota);
limiter.getQuota(identifier);    // RateLimitQuota | null
limiter.resetQuota(identifier);
limiter.getUsageByIdentifier(identifier); // usage vs quota
```

## Warnings

```typescript
interface RateLimitWarning {
  identifier: string;
  level: 'low' | 'medium' | 'high';
  count: number;
  timestamp: Date;
  message: string;
}
```

`checkRateLimitExtended` returns `warnings` alongside the result; `addWarning`/`getWarnings`/`clearWarnings` manage them manually.

## Best Practices

- Rules: descriptive names, explicit `priority`, minimal `conditions`; review stale rules with `getRateLimitRules()`.
- Exceptions: always set `reason`/`createdBy`; prefer `temporary` + `expiresAt`; audit via `getRateLimitExceptions()`.
- Tiers: design around business levels; keep `conditions` declarative (`user_role`, `subscription_level`) before `custom`.
- Quotas: size from capacity; surface `getUsageByIdentifier` to callers; notify before exhaustion.
