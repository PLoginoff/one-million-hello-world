# Identifiers and Scopes

## Overview
The Rate Limiting Layer supports multiple identifier types and scopes to provide flexible rate limiting for different use cases. Identifiers determine what is being rate limited, while scopes define the context of the rate limit.

## Identifier Types

### IP-Based Rate Limiting
```typescript
interface IPIdentifier {
  type: 'ip';
  value: string;
}

class IPBasedRateLimiter {
  async checkLimit(ip: string): Promise<RateLimitResult> {
    const identifier: IPIdentifier = { type: 'ip', value: ip };
    return this.rateLimiter.checkLimit(identifier);
  }
}
```

**Use Cases:**
- Anonymous users
- DDoS protection
- Geographic rate limiting
- Per-IP throttling

**Configuration:**
```typescript
interface IPBasedConfig {
  maxRequests: number;
  windowMs: number;
  includeIPv6: boolean;
  respectXForwardedFor: boolean;
}
```

### User ID-Based Rate Limiting
```typescript
interface UserIDIdentifier {
  type: 'userId';
  value: string;
}

class UserIDBasedRateLimiter {
  async checkLimit(userId: string): Promise<RateLimitResult> {
    const identifier: UserIDIdentifier = { type: 'userId', value: userId };
    return this.rateLimiter.checkLimit(identifier);
  }
}
```

**Use Cases:**
- Authenticated users
- Per-user quotas
- Tiered access levels
- User-specific limits

**Configuration:**
```typescript
interface UserIDBasedConfig {
  maxRequests: number;
  windowMs: number;
  tierOverrides: Map<string, TierConfig>;
}
```

### API Key-Based Rate Limiting
```typescript
interface APIKeyIdentifier {
  type: 'apiKey';
  value: string;
}

class APIKeyBasedRateLimiter {
  async checkLimit(apiKey: string): Promise<RateLimitResult> {
    const identifier: APIKeyIdentifier = { type: 'apiKey', value: apiKey };
    return this.rateLimiter.checkLimit(identifier);
  }
}
```

**Use Cases:**
- API clients
- Service accounts
- Third-party integrations
- Per-application limits

**Configuration:**
```typescript
interface APIKeyBasedConfig {
  maxRequests: number;
  windowMs: number;
  keySpecificLimits: Map<string, number>;
}
```

### Custom Identifiers
```typescript
interface CustomIdentifier {
  type: 'custom';
  value: string;
  context: any;
}

class CustomIdentifierRateLimiter {
  async checkLimit(identifier: string, context: any): Promise<RateLimitResult> {
    const customIdentifier: CustomIdentifier = { 
      type: 'custom', 
      value: identifier,
      context
    };
    return this.rateLimiter.checkLimit(customIdentifier);
  }
}
```

**Use Cases:**
- Organization-based limiting
- Project-based limiting
- Resource-specific limiting
- Custom business logic

## Scopes

### Global Scope
```typescript
enum RateLimitScope {
  GLOBAL = 'global',
  PER_USER = 'per-user',
  PER_API_KEY = 'per-api-key',
  PER_IP = 'per-ip',
  PER_ENDPOINT = 'per-endpoint',
  CUSTOM = 'custom'
}

interface GlobalScopeConfig {
  scope: RateLimitScope.GLOBAL;
  maxRequests: number;
  windowMs: number;
}
```

**Use Cases:**
- System-wide protection
- Total capacity management
- Infrastructure limits

### Per-User Scope
```typescript
interface PerUserScopeConfig {
  scope: RateLimitScope.PER_USER;
  maxRequests: number;
  windowMs: number;
  tierBased: boolean;
}
```

**Use Cases:**
- User quotas
- Fair usage policies
- Tiered access

### Per-API Key Scope
```typescript
interface PerAPIKeyScopeConfig {
  scope: RateLimitScope.PER_API_KEY;
  maxRequests: number;
  windowMs: number;
  keySpecific: boolean;
}
```

**Use Cases:**
- API client limits
- Service account quotas
- Integration limits

### Per-IP Scope
```typescript
interface PerIPScopeConfig {
  scope: RateLimitScope.PER_IP;
  maxRequests: number;
  windowMs: number;
  subnetBased: boolean;
}
```

**Use Cases:**
- DDoS protection
- Geographic limiting
- Network-based quotas

### Per-Endpoint Scope
```typescript
interface PerEndpointScopeConfig {
  scope: RateLimitScope.PER_ENDPOINT;
  maxRequests: number;
  windowMs: number;
  endpointSpecificLimits: Map<string, number>;
}
```

**Use Cases:**
- Resource protection
- Expensive operation limiting
- Per-endpoint quotas

### Custom Scope
```typescript
interface CustomScopeConfig {
  scope: RateLimitScope.CUSTOM;
  scopeKey: string;
  maxRequests: number;
  windowMs: number;
  scopeFunction?: (context: any) => string;
}
```

**Use Cases:**
- Organization-based limiting
- Project-based limiting
- Custom business logic

## Identifier Resolution

### Resolution Strategy
```typescript
class IdentifierResolver {
  async resolveIdentifier(request: HttpRequest): Promise<Identifier> {
    // Check for API key first
    const apiKey = this.extractAPIKey(request);
    if (apiKey) {
      return { type: 'apiKey', value: apiKey };
    }
    
    // Check for user ID
    const userId = this.extractUserID(request);
    if (userId) {
      return { type: 'userId', value: userId };
    }
    
    // Fall back to IP
    const ip = this.extractIP(request);
    return { type: 'ip', value: ip };
  }
  
  private extractAPIKey(request: HttpRequest): string | null {
    return request.headers.get('x-api-key') || 
           request.headers.get('authorization')?.replace('Bearer ', '') ||
           null;
  }
  
  private extractUserID(request: HttpRequest): string | null {
    return request.securityContext?.userId || null;
  }
  
  private extractIP(request: HttpRequest): string {
    return request.remoteAddress;
  }
}
```

### Multi-Identifier Rate Limiting
```typescript
class MultiIdentifierRateLimiter {
  async checkLimit(request: HttpRequest): Promise<RateLimitResult> {
    const identifiers = await this.resolveAllIdentifiers(request);
    
    for (const identifier of identifiers) {
      const result = await this.rateLimiter.checkLimit(identifier);
      if (!result.allowed) {
        return result;
      }
    }
    
    return { allowed: true, remaining: Infinity };
  }
  
  private async resolveAllIdentifiers(request: HttpRequest): Promise<Identifier[]> {
    const identifiers: Identifier[] = [];
    
    const ip = this.extractIP(request);
    identifiers.push({ type: 'ip', value: ip });
    
    const userId = this.extractUserID(request);
    if (userId) {
      identifiers.push({ type: 'userId', value: userId });
    }
    
    const apiKey = this.extractAPIKey(request);
    if (apiKey) {
      identifiers.push({ type: 'apiKey', value: apiKey });
    }
    
    return identifiers;
  }
}
```

## Scope Resolution

### Scope Selection
```typescript
class ScopeResolver {
  resolveScope(request: HttpRequest, config: RateLimitConfig): RateLimitScope {
    // Check for custom scope function
    if (config.customScopeFunction) {
      return config.customScopeFunction(request);
    }
    
    // Check for endpoint-specific scope
    if (config.endpointSpecificLimits.has(request.uri)) {
      return RateLimitScope.PER_ENDPOINT;
    }
    
    // Check for user-based scope
    if (request.securityContext?.userId) {
      return RateLimitScope.PER_USER;
    }
    
    // Check for API key-based scope
    if (this.extractAPIKey(request)) {
      return RateLimitScope.PER_API_KEY;
    }
    
    // Default to IP-based scope
    return RateLimitScope.PER_IP;
  }
}
```

### Composite Scopes
```typescript
interface CompositeScope {
  scopes: RateLimitScope[];
  operator: 'AND' | 'OR';
}

class CompositeScopeRateLimiter {
  async checkLimit(request: HttpRequest, scope: CompositeScope): Promise<RateLimitResult> {
    const results: RateLimitResult[] = [];
    
    for (const s of scope.scopes) {
      const result = await this.checkScope(request, s);
      results.push(result);
    }
    
    if (scope.operator === 'AND') {
      return this.combineAnd(results);
    } else {
      return this.combineOr(results);
    }
  }
  
  private combineAnd(results: RateLimitResult[]): RateLimitResult {
    const minRemaining = Math.min(...results.map(r => r.remaining));
    return {
      allowed: results.every(r => r.allowed),
      remaining: minRemaining,
      resetTime: new Date(Math.max(...results.map(r => r.resetTime.getTime())))
    };
  }
  
  private combineOr(results: RateLimitResult[]): RateLimitResult {
    const maxRemaining = Math.max(...results.map(r => r.remaining));
    return {
      allowed: results.some(r => r.allowed),
      remaining: maxRemaining,
      resetTime: new Date(Math.min(...results.map(r => r.resetTime.getTime())))
    };
  }
}
```

## Best Practices

### Identifier Selection Guidelines
- Use IP-based limiting for anonymous users
- Use user ID-based limiting for authenticated users
- Use API key-based limiting for API clients
- Use custom identifiers for business-specific needs

### Scope Selection Guidelines
- Use global scope for system-wide limits
- Use per-user scope for fair usage policies
- Use per-endpoint scope for resource protection
- Use custom scope for business logic

### Multi-Identifier Guidelines
- Apply all relevant identifiers for comprehensive protection
- Prioritize identifiers based on reliability
- Consider performance implications of multi-identifier checks
