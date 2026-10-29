# ADR: IdentityProvider Layer

## Status
Accepted

## Decisions

### 1. Federation separate from identity management
`identity-provider` (Layer 66) talks to external IdPs; `identity` (Layer 36) manages local user entities. Two layers because provider federation (OIDC/SAML protocols, token exchange) and user CRUD have different lifecycles, dependencies, and failure modes.

### 2. Provider-agnostic contract
`execute(IdentityProviderContext)` abstracts provider operations — authenticate, fetch profile, validate assertion — so OIDC, SAML, and LDAP backends are interchangeable behind the same interface.

### 3. Cached strategy for provider metadata
Provider metadata (discovery docs, JWKS, userinfo) is read-heavy and changes rarely — `cached` avoids hammering the IdP on every request.

### 4. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'IDENTITYPROVIDER_EXECUTION_ERROR' } }` — a failed provider call (IdP outage, bad assertion) degrades to a handled result for auth layers above.

### 5. Provider adapters as the seam
Real OIDC/SAML implementations plug into the adapter interface; in-memory providers ship for tests.
