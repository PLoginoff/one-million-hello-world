# ADR: EdgeCache Layer

## Status
Accepted

## Decisions

### 1. CDN-provider-agnostic contract
Cache operations go through `execute(EdgeCacheContext)` rather than provider-specific APIs — the same purge/get/set semantics work whether the backing edge is Cloudflare, Fastly, or an in-memory stand-in.

### 2. Adapters as the provider seam
Only InMemory/Mock/Stub adapters ship in-repo; real CDN adapters plug into the adapter interface without touching strategies or domain logic.

### 3. `cached` strategy as a meta-cache
The `cached` strategy memoizes operation results on top of the edge cache itself — useful for purge-status polling and repeated lookups that would otherwise round-trip to the CDN API.

### 4. TTL modeled as a domain value object
`EdgeCacheTimeWindow` is a first-class value object (containment checks, age computation) rather than a bare `number` — TTL bugs are the classic edge-cache failure mode.

### 5. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'EDGECACHE_EXECUTION_ERROR' } }` so a CDN outage degrades to a handled result instead of an exception in the request path.
