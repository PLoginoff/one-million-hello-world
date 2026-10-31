# Security Policies

## Overview
Security policy is a single `SecurityPolicyConfig` object managed by `SecurityManager.setSecurityPolicy(partial)` / `getSecurityPolicy()`. Each area has an `enable*` flag plus a nested config; the manager exposes one validation method per area. No separate `PolicyManager`/validator classes — all checks are methods on `ISecurityManager`.

## `SecurityPolicyConfig`

```typescript
interface SecurityPolicyConfig {
  requireAuth: boolean;
  allowedRoles: string[];
  corsEnabled: boolean;           corsConfig: CorsConfig;
  threatDetectionEnabled: boolean;
  maxRequestSize: number;         maxHeaderSize: number;
  enableRateLimiting: boolean;    rateLimitConfig: RateLimitConfig;
  enableIPFiltering: boolean;     ipFilterConfig: IPFilterConfig;
  enableUserAgentFiltering: boolean; userAgentFilterConfig: UserAgentFilterConfig;
  enableSignatureValidation: boolean; signatureConfig: SignatureConfig;
  enableTimestampValidation: boolean; timestampConfig: TimestampConfig;
  enableNonceValidation: boolean;    nonceConfig: NonceConfig;
  requiredHeaders: string[];
  allowedContentTypes: string[];
}
```

## Policy Areas

### Auth & Roles
`requireAuth` gates unauthenticated requests; `allowedRoles` feeds `authorize(ctx, permissions)`. `authenticate(request, credentials)` returns `AuthResult { success, context?, error? }` where `context` is a `SecurityContext { isAuthenticated, userId?, roles, permissions, ipAddress, userAgent }`.

```typescript
const auth = manager.authenticate(request, { token });
if (!auth.success) reject(auth.error); // SecurityErrorCode.UNAUTHORIZED etc.
manager.authorize(auth.context!, ['read:users']);
```

### CORS (`validateCors`)
`CorsConfig`: `allowedOrigins`, `allowedMethods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`. See `cors-threat-detection.md`.

### Rate Limiting (`checkRateLimit`)
`RateLimitConfig`: `maxRequests`, `windowMs`, `skipSuccessfulRequests`, `skipFailedRequests`, `enableBurstProtection`, `burstLimit`. Inspect with `getRateLimitEntry(ip)`.

### IP Filtering (`validateIPAddress`, `getIPInfo`)
`IPFilterConfig`: `whitelist`, `blacklist`, `allowPrivateIPs`, `blockTorExitNodes`, `blockVPNs`. `getIPInfo(ip)` returns `{ isPrivate, isTorExitNode, isVPN, country?, city? }`.

### User-Agent Filtering (`validateUserAgent`)
`UserAgentFilterConfig`: `blockedPatterns`, `allowedPatterns`, `requireUserAgent`.

### Signature / Timestamp / Nonce
- `SignatureConfig`: `algorithm: 'HMAC-SHA256'|'HMAC-SHA512'|'RSA-SHA256'`, `secretKey`, `headerName` → `validateSignature(request)`.
- `TimestampConfig`: `maxAge`, `clockSkewTolerance`, `headerName` → `validateTimestamp(request)` (rejects `TIMESTAMP_TOO_OLD`/`_TOO_NEW`).
- `NonceConfig`: `maxAge`, `headerName` → `validateNonce(request)`; `addNonce`, `isNonceUsed`, `cleanupExpiredNonces` prevent replay.

### Request Shape
- `validateRequestSize` ← `maxRequestSize`
- `validateHeaderSize` ← `maxHeaderSize`
- `validateRequiredHeaders` ← `requiredHeaders`
- `validateContentType` ← `allowedContentTypes`

## Updating Policy at Runtime

```typescript
manager.setSecurityPolicy({
  requireAuth: true,
  enableIPFiltering: true,
  ipFilterConfig: { whitelist: [], blacklist: ['10.0.0.0/8'], allowPrivateIPs: false, blockTorExitNodes: true, blockVPNs: true },
});
const policy = manager.getSecurityPolicy();
```

`setSecurityPolicy` merges partial config — send only the keys you change. Track effective policy via `getSecurityPolicy()` and audit via `logSecurityEvent`/`getAuditLog`.

## Observability

```typescript
manager.getStats();            // auth attempts, threatsByType, violations
manager.getHealthStatus();     // status + per-area checks
manager.runDiagnostics();      // traceId, steps, summary
manager.getWarnings();         // accumulated SecurityWarning[]
manager.getAuditLog(limit);    // SecurityAuditLog[]
```

## Best Practices

- Turn on only the gates you need; each adds per-request cost.
- Keep `whitelist`/`blacklist` and `requiredHeaders`/`allowedContentTypes` explicit — empty means "allow all".
- Prefer `HMAC-SHA256` signatures + `enableNonceValidation` for replay protection on sensitive endpoints.
- Pair `enableRateLimiting` with `burstLimit`; monitor `getRateLimitEntry` for hot IPs.
