# Testing Strategy

## Overview
The Security Layer follows a comprehensive testing strategy to ensure security correctness, reliability, and performance. Tests are organized into unit tests, integration tests, and security-specific tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **ISecurityManager Interface**: 100% (type validation)
- **SecurityManager Implementation**: 99%+
- **Authentication Methods**: 99%+
- **Authorization Logic**: 99%+
- **CORS Validation**: 99%+
- **Threat Detection**: 95%+
- **Policy Management**: 99%+

## Unit Tests

### Test Organization
```
src/layers/security/__tests__/
├── unit/
│   ├── authentication/
│   │   ├── bearer-token.test.ts
│   │   ├── api-key.test.ts
│   │   ├── basic-auth.test.ts
│   │   ├── jwt.test.ts
│   │   ├── oauth2.test.ts
│   │   ├── session-cookie.test.ts
│   │   └── signature.test.ts
│   ├── authorization/
│   │   ├── rbac.test.ts
│   │   ├── permission.test.ts
│   │   └── context.test.ts
│   ├── cors/
│   │   ├── validation.test.ts
│   │   ├── preflight.test.ts
│   │   └── headers.test.ts
│   ├── threat-detection/
│   │   ├── xss.test.ts
│   │   ├── sql-injection.test.ts
│   │   ├── csrf.test.ts
│   │   ├── path-traversal.test.ts
│   │   ├── ddos.test.ts
│   │   └── command-injection.test.ts
│   ├── policies/
│   │   ├── rate-limiting.test.ts
│   │   ├── ip-filtering.test.ts
│   │   ├── user-agent-filtering.test.ts
│   │   └── content-validation.test.ts
│   └── security-manager.test.ts
```

### Unit Test Categories

#### 1. Bearer Token Authentication Tests
```typescript
describe('Bearer Token Authentication', () => {
  it('should authenticate valid bearer token', async () => {
    const token = generateValidToken();
    const result = await securityManager.authenticateBearerToken(`Bearer ${token}`);
    expect(result.success).toBe(true);
    expect(result.context).toBeDefined();
  });

  it('should reject invalid token format', async () => {
    const result = await securityManager.authenticateBearerToken('Bearer invalid');
    expect(result.success).toBe(false);
    expect(result.error).toBe(AuthError.INVALID_TOKEN_FORMAT);
  });

  it('should reject expired token', async () => {
    const token = generateExpiredToken();
    const result = await securityManager.authenticateBearerToken(`Bearer ${token}`);
    expect(result.success).toBe(false);
    expect(result.error).toBe(AuthError.TOKEN_EXPIRED);
  });

  it('should reject token from invalid issuer', async () => {
    const token = generateTokenWithInvalidIssuer();
    const result = await securityManager.authenticateBearerToken(`Bearer ${token}`);
    expect(result.success).toBe(false);
    expect(result.error).toBe(AuthError.INVALID_ISSUER);
  });
});
```

#### 2. API Key Authentication Tests
```typescript
describe('API Key Authentication', () => {
  it('should authenticate valid API key', async () => {
    const apiKey = await createValidApiKey();
    const result = await securityManager.authenticateApiKey(`ApiKey ${apiKey}`);
    expect(result.success).toBe(true);
  });

  it('should reject inactive API key', async () => {
    const apiKey = await createInactiveApiKey();
    const result = await securityManager.authenticateApiKey(`ApiKey ${apiKey}`);
    expect(result.success).toBe(false);
    expect(result.error).toBe(AuthError.API_KEY_INACTIVE);
  });

  it('should reject expired API key', async () => {
    const apiKey = await createExpiredApiKey();
    const result = await securityManager.authenticateApiKey(`ApiKey ${apiKey}`);
    expect(result.success).toBe(false);
    expect(result.error).toBe(AuthError.API_KEY_EXPIRED);
  });
});
```

#### 3. RBAC Authorization Tests
```typescript
describe('RBAC Authorization', () => {
  it('should authorize user with correct permission', async () => {
    const context = createSecurityContextWithRole('admin');
    const permission = { resource: 'users', action: 'create' };
    const result = await rbac.authorize(context, permission);
    expect(result).toBe(true);
  });

  it('should deny user without permission', async () => {
    const context = createSecurityContextWithRole('user');
    const permission = { resource: 'users', action: 'delete' };
    const result = await rbac.authorize(context, permission);
    expect(result).toBe(false);
  });

  it('should check inherited roles', async () => {
    const context = createSecurityContextWithRole('moderator');
    const permission = { resource: 'posts', action: 'approve' };
    const result = await rbac.authorize(context, permission);
    expect(result).toBe(true);
  });
});
```

#### 4. CORS Validation Tests
```typescript
describe('CORS Validation', () => {
  it('should allow request from whitelisted origin', async () => {
    const request = createRequestWithOrigin('https://example.com');
    const result = await securityManager.validateCORS(request);
    expect(result.allowed).toBe(true);
  });

  it('should reject request from non-whitelisted origin', async () => {
    const request = createRequestWithOrigin('https://malicious.com');
    const result = await securityManager.validateCORS(request);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe(CORSError.ORIGIN_NOT_ALLOWED);
  });

  it('should handle preflight request correctly', async () => {
    const request = createPreflightRequest('https://example.com', 'POST');
    const result = await securityManager.validateCORS(request);
    expect(result.allowed).toBe(true);
    expect(result.preflight).toBe(true);
  });
});
```

#### 5. XSS Detection Tests
```typescript
describe('XSS Detection', () => {
  it('should detect script tag injection', () => {
    const input = '<script>alert("XSS")</script>';
    const result = threatDetector.detectXSS(input);
    expect(result.detected).toBe(true);
    expect(result.type).toBe(ThreatType.XSS);
  });

  it('should detect javascript protocol', () => {
    const input = 'javascript:alert("XSS")';
    const result = threatDetector.detectXSS(input);
    expect(result.detected).toBe(true);
  });

  it('should detect event handler injection', () => {
    const input = '<img onerror="alert(1)" src="x">';
    const result = threatDetector.detectXSS(input);
    expect(result.detected).toBe(true);
  });

  it('should not detect safe input', () => {
    const input = 'Hello World';
    const result = threatDetector.detectXSS(input);
    expect(result.detected).toBe(false);
  });
});
```

#### 6. SQL Injection Detection Tests
```typescript
describe('SQL Injection Detection', () => {
  it('should detect SQL injection pattern', () => {
    const input = "' OR '1'='1";
    const result = threatDetector.detectSQLInjection(input);
    expect(result.detected).toBe(true);
  });

  it('should detect SQL keyword', () => {
    const input = 'SELECT * FROM users';
    const result = threatDetector.detectSQLInjection(input);
    expect(result.detected).toBe(true);
  });

  it('should detect SQL tautology', () => {
    const input = '1 OR 1=1';
    const result = threatDetector.detectSQLInjection(input);
    expect(result.detected).toBe(true);
  });
});
```

#### 7. Rate Limiting Tests
```typescript
describe('Rate Limiting', () => {
  it('should allow requests under limit', async () => {
    const ip = '192.168.1.1';
    for (let i = 0; i < 10; i++) {
      const result = await rateLimiter.checkLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it('should block requests over limit', async () => {
    const ip = '192.168.1.2';
    const config = { maxRequests: 5, windowMs: 60000 };
    const limiter = new RateLimiter(config);
    
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit(ip);
    }
    
    const result = await limiter.checkLimit(ip);
    expect(result.allowed).toBe(false);
  });

  it('should reset after window expires', async () => {
    const ip = '192.168.1.3';
    const config = { maxRequests: 1, windowMs: 100 };
    const limiter = new RateLimiter(config);
    
    await limiter.checkLimit(ip);
    const result = await limiter.checkLimit(ip);
    expect(result.allowed).toBe(false);
    
    await sleep(150);
    const result2 = await limiter.checkLimit(ip);
    expect(result2.allowed).toBe(true);
  });
});
```

#### 8. IP Filtering Tests
```typescript
describe('IP Filtering', () => {
  it('should block blacklisted IP', () => {
    const ip = '192.168.1.100';
    const config = { blacklist: ['192.168.1.100'] };
    const filter = new IPFilter(config);
    const result = filter.filter(ip);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('IP blacklisted');
  });

  it('should allow whitelisted IP', () => {
    const ip = '192.168.1.200';
    const config = { whitelist: ['192.168.1.200'] };
    const filter = new IPFilter(config);
    const result = filter.filter(ip);
    expect(result.allowed).toBe(true);
  });

  it('should block private IP when configured', () => {
    const ip = '192.168.1.50';
    const config = { filterPrivateIPs: true };
    const filter = new IPFilter(config);
    const result = filter.filter(ip);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Private IP blocked');
  });
});
```

## Integration Tests

### Full Security Pipeline
```typescript
describe('Security Pipeline Integration', () => {
  it('should authenticate and authorize request successfully', async () => {
    const request = createAuthenticatedRequest();
    const result = await securityManager.processRequest(request);
    expect(result.authenticated).toBe(true);
    expect(result.authorized).toBe(true);
  });

  it('should block request with invalid credentials', async () => {
    const request = createRequestWithInvalidCredentials();
    const result = await securityManager.processRequest(request);
    expect(result.authenticated).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('should detect and block threats', async () => {
    const request = createRequestWithXSS();
    const result = await securityManager.processRequest(request);
    expect(result.threatsDetected).toBeGreaterThan(0);
    expect(result.blocked).toBe(true);
  });
});
```

### Policy Integration Tests
```typescript
describe('Policy Integration', () => {
  it('should apply updated policy immediately', async () => {
    const policy = { rateLimiting: { maxRequests: 10 } };
    securityManager.updatePolicy(policy);
    
    const request = createRequest();
    for (let i = 0; i < 11; i++) {
      await securityManager.processRequest(request);
    }
    
    const result = await securityManager.processRequest(request);
    expect(result.rateLimited).toBe(true);
  });

  it('should validate policy before applying', () => {
    const invalidPolicy = { rateLimiting: { maxRequests: -1 } };
    const result = securityManager.validatePolicy(invalidPolicy);
    expect(result.valid).toBe(false);
  });
});
```

## Security Tests

### Authentication Security Tests
```typescript
describe('Authentication Security', () => {
  it('should prevent timing attacks on password comparison', async () => {
    const password = 'correct_password';
    const wrongPassword = 'wrong_password';
    
    const time1 = await measureTime(() => 
      authService.compare(password, await hash(password))
    );
    
    const time2 = await measureTime(() => 
      authService.compare(password, await hash(wrongPassword))
    );
    
    // Times should be similar (within 10%)
    expect(Math.abs(time1 - time2) / time1).toBeLessThan(0.1);
  });

  it('should prevent token reuse', async () => {
    const token = generateOneTimeToken();
    await securityManager.authenticateBearerToken(`Bearer ${token}`);
    
    const result = await securityManager.authenticateBearerToken(`Bearer ${token}`);
    expect(result.success).toBe(false);
  });
});
```

### Threat Detection Security Tests
```typescript
describe('Threat Detection Security', () => {
  it('should detect polymorphic XSS attacks', () => {
    const inputs = [
      '<script>alert(1)</script>',
      '<SCRIPT>alert(1)</SCRIPT>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>'
    ];
    
    for (const input of inputs) {
      const result = threatDetector.detectXSS(input);
      expect(result.detected).toBe(true);
    }
  });

  it('should detect advanced SQL injection', () => {
    const inputs = [
      "' UNION SELECT * FROM users--",
      "1; DROP TABLE users--",
      "' OR 1=1--",
      "admin'--"
    ];
    
    for (const input of inputs) {
      const result = threatDetector.detectSQLInjection(input);
      expect(result.detected).toBe(true);
    }
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should authenticate within time limit', async () => {
    const request = createAuthenticatedRequest();
    const start = Date.now();
    await securityManager.authenticate(request);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // < 50ms
  });

  it('should detect threats efficiently', () => {
    const input = 'test input';
    const start = Date.now();
    threatDetector.detectThreats(input);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10); // < 10ms
  });

  it('should handle high request rate', async () => {
    const requests = Array(1000).fill(null).map(() => createRequest());
    const start = Date.now();
    
    await Promise.all(requests.map(r => securityManager.processRequest(r)));
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // < 5s for 1000 requests
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
class MockSecurityManager implements ISecurityManager {
  async authenticate(request: HttpRequest): Promise<AuthenticationResult> {
    return { success: true, context: createMockSecurityContext() };
  }
  
  async authorize(context: SecurityContext, permission: Permission): Promise<boolean> {
    return true;
  }
}

function createMockSecurityContext(): SecurityContext {
  return {
    userId: 'test-user',
    roles: ['user'],
    permissions: [],
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    authenticationMethod: AuthenticationMethod.BEARER_TOKEN,
    authenticatedAt: new Date(),
    metadata: new Map()
  };
}

function createAuthenticatedRequest(): HttpRequest {
  return {
    method: HttpMethod.GET,
    uri: '/api/test',
    version: HttpVersion.HTTP_1_1,
    headers: new Map([['authorization', 'Bearer valid-token']]),
    body: Buffer.alloc(0)
  };
}
```

### Test Helpers
```typescript
async function measureTime(fn: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/security
```

### Integration Tests
```bash
npm run test:integration -- src/layers/security
```

### Security Tests
```bash
npm run test:security -- src/layers/security
```

### All Tests
```bash
npm test -- src/layers/security
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/security
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Security Layer Tests

on:
  pull_request:
    paths:
      - 'src/layers/security/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/security
      - run: npm run test:integration -- src/layers/security
      - run: npm run test:security -- src/layers/security
      - run: npm run test:coverage -- src/layers/security
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test both success and failure paths
- Test edge cases and boundary conditions
- Use realistic test data
- Mock external dependencies
- Test security features thoroughly
- Test performance characteristics
- Maintain test independence

### Security Testing Guidelines
- Test all authentication methods
- Test authorization scenarios
- Test threat detection with various payloads
- Test policy enforcement
- Test rate limiting behavior
- Test IP filtering logic
- Test CORS validation
- Test error handling and logging
