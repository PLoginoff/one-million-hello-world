# ADR: Localization Layer

## Status
Accepted

## Decisions

### 1. Low-layer placement
Localization sits at Layer 2 so every layer above can emit localized output — i18n is infrastructure, not a UI concern.

### 2. Catalog behind a repository seam
Message catalogs plug into `domain/repositories/` — in-memory for tests, file/DB-backed catalogs via the same interface for production. The domain model doesn't care where strings live.

### 3. Cached lookups as the default posture
Message resolution is read-dominated and catalogs change rarely — `cached` exists precisely because per-key lookups repeat constantly.

### 4. Batch resolution for locale loads
Loading a whole message set per locale (page render, client bootstrap) uses `batch` — one call, not N key lookups.

### 5. Missing keys as results, not exceptions
`execute()` returns `LocalizationResult { success, data?, error? }` — an absent translation is a handled outcome (fall back to default locale), not a thrown error.
