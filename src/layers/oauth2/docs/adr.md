# ADR: OAuth2 Layer

## Status
Accepted

## Context
The system needs to issue and validate tokens with standard OAuth2
semantics — clients, grants, revocation — rather than ad-hoc session
tokens.

## Decisions

### 1. Full authorization-server surface behind one facade
`OAuth2AuthorizationServer` composes `ClientRegistry`, `TokenStore`, and
the four grant classes. Callers hit `tokenEndpoint` /
`introspect` / `revoke` without wiring components themselves.

### 2. All four RFC grants, including device flow
Authorization code (with PKCE), client credentials, refresh token, and
device code are each implemented as a separate class under `grants/`.
Separating them keeps each state machine small and lets error semantics
match its RFC exactly.

### 3. PKCE S256 required for authorization-code exchange
Clients carry a `requirePkce` flag; `Pkce.verify` does a constant-time
comparison of the derived challenge. This is the current best-practice
default for public clients.

### 4. Refresh-token rotation with family reuse detection
Each refresh consumes the old token and issues a new one tagged with the
same `familyId`. Presenting a rotated token revokes the whole family —
the RFC 6819 countermeasure against token theft.

### 5. Hashed client secrets, constant-time auth
Client secrets are stored as `SHA-256(salt + secret)`; the registry never
holds plaintext, and authentication compares digests in constant time.

### 6. Errors as typed `OAuth2Error` with RFC codes
`OAuth2Error` carries `code`, `description`, `uri`, and the correct HTTP
status per RFC 6749 §5.2 / RFC 8628 §3.5, so controllers can serialize
`toJSON()` directly into a compliant error response.

### 7. In-memory token store
Tokens, codes, and device grants live in `TokenStore` maps. This keeps
the layer dependency-free; persistence is an adapter concern for later.

## Consequences
- Genuinely RFC-conformant behavior including introspection and
  revocation, suitable for integration tests against real clients.
- In-memory storage means restart = all tokens gone; horizontal scaling
  requires a shared store.
- `password` grant type is declared in `GrantType` for completeness but
  not implemented (deprecated by current best practice).
