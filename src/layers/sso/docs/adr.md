# ADR: Sso Layer

## Status
Accepted

## Context
Users authenticate at external identity providers over SAML 2.0 or
OIDC; the app needs to federate that into local sessions and back out
again on logout, without hard-binding to one IdP.

## Decisions

### 1. Ticket-based handoff instead of direct session creation
Federated logins produce a one-time, opaque `SessionTicket`
(`SessionTicketStore`), exchanged for the real local session. Tickets
are stored SHA-256-hashed, are subject-indexed for bulk revocation, and
fail on reuse — replaying a consumed ticket cannot mint a second
session.

### 2. IdP registry as the trust anchor
`IdpRegistry` resolves providers by SAML `entityID` / OIDC issuer URI
and rejects unknown or disabled issuers before any assertion is
trusted. `SsoEngine.consumeSaml` looks the issuer up first.

### 3. OIDC code flow with PKCE and validated state/nonce
`OidcFlow` generates `state`, `nonce`, and an S256 `codeVerifier` per
authorization request and verifies them on callback. `id_token` claims
are decoded but not signature-verified — real verification belongs to
the jwt-validation layer, keeping responsibilities non-overlapping.

### 4. SAML parsing without XML-DSig
`SamlResponseParser` extracts NameID, attributes, conditions, and
session index and validates audience/expiry, but treats signature
verification as a stubbed flag. The parser exists to be
protocol-shaped and testable; a production deployment would plug in an
XML-DSig verifier behind the same call.

### 5. SLO transport injected
`SloCoordinator` takes a `SloTransport` callback (`sendLogoutRequest`)
so tests observe propagation without HTTP, and hosts choose back- vs.
front-channel delivery.

### 6. Declarative attribute mapping
`AttributeMapper` applies `source → target (+transform)` rules, so
per-IdP claim normalization is configuration, not code.

## Consequences
- Deterministic, network-free tests for the full SSO lifecycle.
- Security caveat is explicit and localized: signature verification of
  SAML/OIDC tokens is intentionally out of scope here.
