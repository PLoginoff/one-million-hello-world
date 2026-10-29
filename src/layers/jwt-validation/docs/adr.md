# ADR: JwtValidation Layer

## Status
Accepted

## Decisions

### 1. Caller-supplied algorithm allowlist
`JwtVerifier` takes the allowed `alg` list explicitly and additionally checks that the token's algorithm *family* matches the key material. This blocks the classic algorithm-confusion attack (RS256 public key abused as HMAC secret) by construction, not by documentation.

### 2. Decode vs verify split
`JwtParser` decodes structure only; `JwtVerifier` does signature + claims. Unverified decodes are needed for `kid` lookup and routing, but the API names make the security boundary obvious.

### 3. JWKS with DoS bounds
`JwkStore` resolves by `kid`+alg and refreshes from a remote endpoint, capping accepted keys (`maxKeys`) so a hostile or broken endpoint can't exhaust memory.

### 4. Rotation via grace periods, not flag days
`KeyRotationStrategy` keeps retired keys verifiable until their grace period ends — old tokens keep working while new tokens use the active key. Same idea as `TokenRefresher`'s refresh-token rotation-on-use with server-side SHA-256 hashes (raw refresh tokens are never stored).

### 5. Self-pruning blacklist
`TokenBlacklist` stores each revoked `jti` with its `exp`; once expired the entry is dropped automatically — a revoked token can never become valid again, and the list doesn't grow forever.

### 6. Five signature algorithms
HS256/RS256/ES256/PS256/EdDSA cover symmetric, RSA, ECDSA, RSA-PSS, and Ed25519 deployments; `ALGORITHM_FAMILY`/`ALGORITHM_HASH` tables drive verification rather than per-algorithm branches.
