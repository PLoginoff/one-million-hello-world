# Sso Layer Architecture

## Position
Layer 67

## Responsibility
Single sign-on integration: SAML 2.0 response consumption and OIDC
authorization-code flow (with PKCE), federated identity-provider
management, one-time session tickets, and single sign-off. All protocol
handling is self-contained under `federation/` — signature verification
is delegated to the jwt-validation layer where noted.

## Federation (`federation/`)

| File | Role |
|------|------|
| `SsoEngine.ts` | Facade wiring registry + parsers + ticket store + SLO. `consumeSaml()` → session ticket; `startOidc()`/`finishOidc()` for the OIDC flow. |
| `SamlResponseParser.ts` | Parses base64 SAML Response XML → `SamlResponse` (NameID, attributes, conditions, session index). Validates conditions (audience, expiry). XML-DSig verification is stubbed to a document flag. |
| `OidcFlow.ts` | Builds authorization URLs (state, nonce, PKCE `codeVerifier` via `randomBytes`/S256), validates callback state+nonce, decodes `id_token` claims **without** signature verification. |
| `IdpRegistry.ts` | Trusted `IdentityProvider`s keyed by id and `entityId`/issuer URI; disabled IdPs are rejected on lookup. |
| `AttributeMapper.ts` | Declarative IdP→local attribute mapping (`source`→`target` + transform); missing sources are skipped. |
| `SessionTicketStore.ts` | Issues opaque one-time `st-<hex>` tickets (SHA-256 hashed at rest), subject-indexed, 5-min default TTL; `consume()` marks a ticket used — reuse fails. |
| `SloCoordinator.ts` | Single sign-off: revokes the subject's local tickets and propagates LogoutRequests through an injectable `SloTransport`, collecting per-IdP results. |
| `types.ts` | `IdentityProvider`, `IdpProtocol` (`saml2`/`oidc`/`oauth2`), `SamlResponse`, `OidcTokens`/`OidcIdTokenClaims`, `SessionTicket`, `AttributeMapping`, `SsoFederationError` + `SsoErrorCode`. |

## Layer scaffold
- `Sso` facade + `ISso` — the generic `execute(context)` contract.
- Five strategies (`SsoDefault/Fast/Reliable/Cached/Batch`, priorities
  0/10/5/7/3) + `SsoStrategyFactory`.
- `domain/` — entities, value objects, services, repository,
  specifications, policies, pipeline, decorators, handlers,
  `SsoExecuted`/`SsoFailed` events.
- Adapters: `InMemoryAdapter`, `MockAdapter`, `StubAdapter`.
- Cross-cutting: `SsoHealthCheck`, `SsoMetricsCollector`,
  `SsoPrometheusMetricsCollector`, `SsoError`/`SsoErrorMapper`.

## Testing
See `testing.md`.
