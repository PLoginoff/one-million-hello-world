# Configuration: Security Layer

## `SecurityConfigOptions` (`configuration/defaults/DefaultConfigs.ts`)

| Option | Type | Description |
|--------|------|-------------|
| `enableAuthentication` | boolean | Run credential checks |
| `enableAuthorization` | boolean | Run RBAC/permission checks |
| `enableThreatDetection` | boolean | Run pattern threat detection |
| `enableRateLimiting` | boolean | Enforce per-IP rate limits |
| `enableCors` | boolean | Validate CORS policy |
| `defaultSecurityLevel` | `SecurityLevel` | LOW / MEDIUM / HIGH baseline |
| `maxFailedAttempts` | number | Failures before lockout |
| `lockoutDuration` | number | Lockout ms |
| `sessionTimeout` | number | Session ms |
| `corsOrigins` / `corsMethods` / `corsHeaders` | string[] | CORS allowlists |
| `threatThresholds` | `Map<ThreatType, number>` | Per-type detection thresholds |

## Presets
| Preset | Auth | Authz | Threats | RateLimit | CORS | Level | maxFailedAttempts | lockout | session |
|--------|------|-------|---------|-----------|------|-------|-------------------|---------|---------|
| `DEFAULT` | on | on | on | on | off | MEDIUM | 5 | 300,000 | 3,600,000 |
| `HIGH_SECURITY` | on | on | on | on | on | HIGH | 3 | 600,000 | 1,800,000 |
| `DEVELOPMENT` | off | off | off | off | on | LOW | 100 | 0 | — |

## Feature configs (`types/security-types.ts`)
`CorsConfig`, `SecurityPolicyConfig`, `RateLimitConfig`,
`IPFilterConfig`, `UserAgentFilterConfig`, `SignatureConfig`,
`TimestampConfig`, `NonceConfig` — per-feature knobs consumed by
`SecurityManager`.

## Builders and validators
- `SecurityConfigBuilder` / `SecurityConfigurationBuilder`
  (`configuration/builders/`).
- `SecurityConfigValidator` / `SecurityConfigurationValidator`
  (`configuration/validators/`).

## Related docs
`authentication-authorization.md`, `cors-threat-detection.md`,
`security-policies.md`.
