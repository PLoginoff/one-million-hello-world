# ADR: Secrets Layer

## Status
Accepted

## Context
Secret resolution must be backend-agnostic: environment variables in
development, a vault in production, in-memory stubs in tests.

## Decisions

### 1. One `ISecrets` contract for every backend
`EnvSecretsAdapter` (env vars with optional key prefixing),
`VaultSecretsAdapter` (Vault-shaped mock with a value cache), and the
generic `InMemory/Mock/Stub` adapters all implement the same
`execute(context)` contract, so swapping the backend is an adapter
choice, not a code change.

### 2. Result envelope instead of throws
Missing secrets return `{ success: false, error: { code:
'SECRET_NOT_FOUND' } }` inside `SecretsResult` — absence is an expected
outcome, not an exception.

### 3. Vault adapter caches resolved values
`VaultSecretsAdapter` memoizes fetched values in a `Map` and reports
`source: 'vault-cache'` — vault reads are the expensive path, so repeat
lookups stay in-process.

### 4. Priority-ordered generic strategies
Five `ISecretsStrategy` implementations (default=0, batch=3, reliable=5,
cached=7, fast=10) created via `SecretsStrategyFactory`, sharing the
layer-wide strategy pattern.

### 5. Rich domain package kept separate
Entities, value objects, services, repository, specifications, policies,
pipeline, decorators, and handlers live under `domain/` and are tested
in isolation from the facade.

## Consequences
- Backends are testable without real Vault or env mutation beyond the
  adapter's own env reads.
- The Vault adapter is a mock — real Vault calls would slot in behind
  the same `ISecrets` contract.
