# ADR: Security Layer

## Status
Accepted

## Context
Inbound requests need authentication, authorization, CORS handling,
threat detection, rate limiting, IP filtering, and audit — behind one
manager, with each concern configurable and independently testable.

## Decisions

### 1. One `SecurityManager` facade, feature-scoped strategies
`SecurityManager` (`implementations/SecurityManager.ts`, ~1 kLOC)
implements `ISecurityManager`. Cross-cutting behaviors are extracted
into strategy classes under `strategies/`: `authentication/`
(`BasicAuthStrategy`, `JwtAuthStrategy`), `cors/` (`CorsStrategy`),
`helmet/` (`HelmetStrategy`), `ipfilter/` (`IpWhitelistStrategy`), plus
`LoggingSecurityStrategy`, `MetricsSecurityStrategy`, and the generic
layer strategies.

### 2. Security context as the currency
`SecurityContext` / `ExtendedSecurityContext` (`types/security-types.ts`)
carries principal, IP info (`IPInfo`), token info (`TokenInfo`), and
session info (`SessionInfo`) through every check; anonymous contexts
are created when auth isn't required.

### 3. Pattern-based threat detection
Threats (XSS, SQLi, CSRF, path traversal, DDoS, command/LDAP/XML
injection, SSRF, XXE, header injection, protocol violation) are matched
by pattern with per-type thresholds (`threatThresholds` map) producing
`ThreatDetectionResult` with risk score and recommendations — fast and
inspectable, at the cost of possible false positives.

### 4. Defense-in-depth toggles
`SecurityConfigOptions` (`configuration/defaults/DefaultConfigs.ts`)
gates authentication, authorization, threat detection, rate limiting,
and CORS independently, with `maxFailedAttempts`/`lockoutDuration`/
`sessionTimeout` knobs. Presets: `DEFAULT`, `HIGH_SECURITY`,
`DEVELOPMENT`.

### 5. Diagnostics and audit first-class
`SecurityStats`, `SecurityHealthStatus`, `SecurityDiagnostics` (trace
id + per-step results), and `SecurityAuditLog` are part of the
`ISecurityManager` contract — security events are data, not log lines.

### 6. Redis adapter for shared state
`adapters/RedisAdapter.ts` provides a shared-state backend alongside
`InMemory`/`Mock`/`Stub` — rate-limit and nonce state can outlive a
single process.

## Consequences
- One facade keeps callers simple; internal strategies keep the
  manager's concerns separated.
- Pattern detection trades absolute coverage for speed/clarity —
  thresholds and presets tune the balance.
- Rich diagnostics make security decisions auditable and testable.
