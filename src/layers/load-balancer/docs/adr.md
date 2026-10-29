# ADR: LoadBalancer Layer

## Status
Accepted

## Decisions

### 1. Shared `BackendPool` as single source of truth
All strategies read health, in-flight counts, and latency from one `BackendPool` instead of tracking backend state privately. Membership changes are pushed to registered strategies via notification — `ConsistentHashing` rebuilds its ring exactly when needed.

### 2. Eight real algorithms, not one tunable algorithm
Round robin, weighted RR, least-connections, least-response-time, consistent hashing, random, IP hash, and power-of-two-choices are separate strategy classes. Each embodies a different routing theory (deterministic, load-aware, affinity, probabilistic) — merging them into one "configurable" strategy would hide the real tradeoffs.

### 3. Consistent hashing with virtual nodes
Key-affinity routing uses a vnode ring (Karger et al., 1997) with binary-search lookup. Virtual nodes smooth distribution across few physical backends and limit remapping to ~1/N of keys on membership change — the property IP-hash and modulo-N approaches lack.

### 4. Power-of-two-choices for O(1) load-aware routing
`PowerOfTwoChoices` gets near-optimal balance (Θ(log log n) max load) without `LeastConnections`' O(N) pool scan — the right default at large pool sizes.

### 5. Three-state health model
`healthy`/`degraded`/`unhealthy` lets strategies shed load gradually (degraded backends get down-weighted, not dropped) instead of binary flap between in/out.

### 6. Dual strategy sets
Real balancing strategies route traffic; the generic five (`default`/`fast`/`reliable`/`cached`/`batch`) keep the uniform `ILoadBalancer.execute(context)` pipeline contract working.
