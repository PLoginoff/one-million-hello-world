# ADR: Identity Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Identity operations flow through `execute(IdentityContext)` so user management composes with auth, audit, and provisioning layers under the shared `Context → Result` shape. This layer manages identities; the separate `identity-provider` layer handles IdP federation — the split keeps local user management independent of external providers.

### 2. Cached lookups for hot paths
Identity reads dominate auth-adjacent traffic — `cached` memoizes repeated lookups, `fast` serves latency-critical paths, `batch` handles bulk provisioning.

### 3. Lifecycle as domain events
`IdentityExecuted`/`IdentityFailed` give provisioning, audit, and deprovisioning flows an event seam to subscribe to rather than polling.

### 4. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'IDENTITY_EXECUTION_ERROR' } }` — a failed lookup is control flow (unknown user), not an exception.

### 5. Store behind adapters
LDAP/SCIM/database identity stores plug into the adapter seam; in-memory implementations ship for tests and local dev.
