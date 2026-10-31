# Authentication and Authorization

## Overview
Auth runs on `SecurityManager`: `authenticate(request, credentials?)` produces a `SecurityContext`; `authorize(context, requiredPermissions)` checks it. `AuthMethod` covers the supported schemes; there are no per-scheme classes — method detection is inside `authenticate`/`extractSecurityContext`.

## Authentication

### `AuthMethod`
`BEARER_TOKEN`, `API_KEY`, `BASIC_AUTH`, `JWT`, `OAUTH2`, `SESSION_COOKIE`, `SIGNATURE`, `ANONYMOUS`.

### `AuthCredentials`
```typescript
interface AuthCredentials {
  token?: string;       // bearer/JWT token
  apiKey?: string;
  username?: string;    // basic auth
  password?: string;
}
```

### `authenticate` / `authenticateExtended`

```typescript
const result = manager.authenticate(request, { token: '...' });
// AuthResult { success, context?: SecurityContext, error?: SecurityError }

const ext = manager.authenticateExtended(request, credentials);
// + metrics (authDuration, totalSecurityTime) + warnings
```

Failures return `error.code` from `SecurityErrorCode`: `UNAUTHORIZED`, `INVALID_TOKEN`, `EXPIRED_TOKEN`, `INVALID_CREDENTIALS`, etc.

### `SecurityContext` / `ExtendedSecurityContext`

```typescript
interface SecurityContext {
  isAuthenticated: boolean;
  userId?: string;
  roles: string[];
  permissions: string[];
  ipAddress: string;
  userAgent: string;
}

interface ExtendedSecurityContext extends SecurityContext {
  tokenInfo?: TokenInfo;      // userId, roles, permissions, issuedAt, expiresAt, issuer, audience
  sessionInfo?: SessionInfo;  // sessionId, createdAt, lastActivity, expiresAt
  ipInfo?: IPInfo;            // isPrivate, isTorExitNode, isVPN, country?, city?
  authMethod: AuthMethod;
  authTime: Date;
  metadata: Map<string, string>;
}
```

```typescript
const ctx = manager.createExtendedContext(request, userId, AuthMethod.JWT);
const inline = manager.extractSecurityContext(request); // context without full auth (from headers)
```

### Method Detection
`authenticate` infers the method from headers (`authorization: Bearer|Basic|Signature`, `x-api-key`, cookies) and the supplied `AuthCredentials`, falling back to `ANONYMOUS` when nothing matches and `requireAuth` is off.

## Authorization

```typescript
manager.authorize(context, ['users:read', 'reports:view']); // boolean
```

- Uses `context.permissions` (and `roles` from `allowedRoles` in `SecurityPolicyConfig`).
- Failures produce `SecurityErrorCode.FORBIDDEN` / `SecurityEvent.AUTHORIZATION_FAILURE`.

```typescript
if (!auth.success) reply(401, auth.error);
if (!manager.authorize(auth.context!, perms)) reply(403, { code: 'FORBIDDEN' });
```

## Anonymous Context
When `requireAuth` is false and no credentials match, `extractSecurityContext`/`authenticate` can yield an `ANONYMOUS` context (`isAuthenticated: false`, empty `roles`/`permissions`). Authorization still applies — anonymous contexts only pass if `requiredPermissions` is empty.

## Audit and Metrics

```typescript
manager.logSecurityEvent(SecurityEvent.AUTH_SUCCESS, request, ctx);
manager.getAuditLog(limit);        // auth/threat/violation entries
manager.getStats();                // totalAuthAttempts, successful/failed, averageAuthTime
manager.getHealthStatus();         // auth + policy checks
```

## Best Practices

- Prefer `authenticateExtended` in hot paths to keep `metrics` for auth timing.
- Store only non-sensitive claims in `context.metadata`; never log `credentials.password`/`token`.
- Rotate `TokenInfo.expiresAt` enforcement through your token issuer; `EXPIRED_TOKEN` is surfaced not swallowed.
- Map auth failures to `SecurityErrorCode` in responses; keep details server-side.
- Gate anonymous access with `requireAuth` + explicit `allowedRoles`, not ad-hoc checks.
