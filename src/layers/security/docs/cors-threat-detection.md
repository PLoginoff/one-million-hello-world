# CORS and Threat Detection

## CORS Validation

### `CorsConfig`
```typescript
interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}
```

Set via `setSecurityPolicy({ corsEnabled: true, corsConfig })`. `validateCors(request)` checks the `Origin` header against `allowedOrigins` (`'*'` allowed); preflight (`OPTIONS` + `Access-Control-Request-*`) validates requested method and headers. Violations surface as `SecurityErrorCode.CORS_VIOLATION` and `SecurityEvent.CORS_VIOLATION`.

```typescript
if (!manager.validateCors(request)) {
  return { success: false, error: { code: SecurityErrorCode.CORS_VIOLATION, message: 'Origin not allowed' } };
}
```

Response headers emitted by the caller: `Access-Control-Allow-Origin` (matched origin or `*`), `-Credentials` when `credentials`, `-Methods`/`-Headers`/`Expose-Headers` from config, `Access-Control-Max-Age`.

## Threat Detection

### `detectThreats(request)` / `detectThreatsExtended(request)`

```typescript
interface ThreatDetectionResult {
  isThreat: boolean;
  threatType?: ThreatType;
  confidence: number;      // 0-1
  details?: string;
}

interface ExtendedThreatDetectionResult extends ThreatDetectionResult {
  detectedPatterns: string[];
  riskScore: number;
  recommendations: string[];
}
```

```typescript
const t = manager.detectThreats(request);
if (t.isThreat) {
  manager.logSecurityEvent(SecurityEvent.THREAT_DETECTED, request, ctx);
}
```

### `ThreatType`
`SQL_INJECTION`, `XSS`, `CSRF`, `PATH_TRAVERSAL`, `BRUTE_FORCE`, `DDOS`, `MALICIOUS_USER_AGENT`, `COMMAND_INJECTION`, `LDAP_INJECTION`, `XML_INJECTION`, `SSRF`, `XXE`, `HEADER_INJECTION`, `PROTOCOL_VIOLATION`.

Detection inspects `request.uri`, headers (`user-agent`, `referer`), and body against per-type patterns. DDoS/brute-force correlate with `checkRateLimit(ip)` and `getRateLimitEntry(ip)`; malicious UAs with `validateUserAgent`.

### Custom Patterns

```typescript
manager.getThreatPatterns(ThreatType.XSS);
manager.addThreatPattern(ThreatType.XSS, '<svg\\s+onload=');
manager.removeThreatPattern(ThreatType.XSS, '<svg\\s+onload=');
```

Patterns feed `detectedPatterns` on the extended result and bump `riskScore`.

## Stats and Warnings

`getStats()` → `totalThreatsDetected`, `threatsByType`, `totalCorsViolations`, `totalRateLimitViolations`, `totalIPBlocks`. `getWarnings()` accumulates `SecurityWarning { code, message, severity: low|medium|high }`.

## Best Practices

### CORS
- Prefer explicit origins over `'*'`; enable `credentials` only with a non-wildcard origin list.
- Keep `allowedMethods`/`allowedHeaders` minimal; set `maxAge` to cache preflights.

### Threat Detection
- Run `detectThreats` early (before auth/body parsing); treat `confidence`/severity when deciding block vs log.
- Combine with `enableRateLimiting` + IP/UA filtering for brute-force and DDoS.
- Review `threatsByType` regularly and tune `addThreatPattern` for observed attacks.
