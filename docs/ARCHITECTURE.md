# Architecture Overview

This document describes the request pipeline, the layer contract, and
the cross-cutting engine modules that every layer carries.

## The Pipeline

A request enters through the network layer and exits through the
transport layer. Between those two points stand one hundred and four
layers, each with a single responsibility and a public interface.
The payload does not change on the way through.

```
HTTP Request
    |
    v
network ............. sockets, pooling, TLS, HTTP/2 framing
    |
http-parser ......... multipart, chunked decoding, headers, URLs
    |
security ............ threat rules, request signing, sessions, CSRF
    |
rate-limiting ....... sliding windows, quotas, penalties
    |
validation .......... schema compiler, coercion, cross-field rules
    |
middleware .......... tracing, correlation, conditional composition
    |
router .............. radix trie, versioning, constraints
    |
controller .......... DTO validation, content negotiation, HATEOAS
    |
service ............. transaction scripts, bulkheads, idempotency
    |
domain .............. aggregates, value objects, specifications
    |
repository .......... specifications, cursors, sharding
    |
cache ............... multi-level, coherence, stampede protection
    |
event ............... append-only log, projections, encryption
    |
message-queue ....... priority heaps, transactions, fairness
    |
data-transformation .. mapping DSL, enrichment, aggregation
    |
serialization ....... binary codec, schema-aware encoding
    |
compression ......... Huffman, LZSS, RLE, delta — measured, adaptive
    |
circuit-breaker ..... per-endpoint registries, probe scheduling
    |
retry ............... budgets, hedging, decorrelated jitter
    |
saga ................ state machines, compensation, timeouts
    |
strategy ............ A/B testing, bandits, kill switches
    |
facade .............. aggregation, batching, orchestration
    |
proxy ............... virtual, protection, caching, remote
    |
decorator ........... composition chains, self-healing
    |
transport ........... chunked framing, SSE, WebSocket, draining
    |
    v
HTTP Response
```

## The Layer Contract

Every layer in `src/layers/<name>/` follows the same structure:

```
src/layers/<name>/
  interfaces/        public contracts (exported as types)
  implementations/   concrete classes behind those contracts
  strategies/        interchangeable algorithms
  factories/         construction with profiles
  configuration/     builders, defaults, validators
  domain/            entities, value objects, services, events
  adapters/          integrations with external systems
  health/            health checks with thresholds
  metrics/           counters, gauges, histograms
  statistics/        aggregated snapshots
  errors/            error taxonomies with codes
  engine/            algorithmic core modules
  docs/              architecture, ADR, configuration, testing
  __tests__/         bun:test suites
```

### The Rules

1. **Dependencies point inward.** A layer may import from the layers
   below it in the pipeline, never from above. The domain layer imports
   nothing from HTTP.
2. **Interfaces at every boundary.** No concrete class crosses a layer
   boundary. Every boundary is a TypeScript interface, re-exported with
   `export type` (a Bun runtime requirement).
3. **Errors as values.** Layers return `Result<T, E>` rather than
   throwing across boundaries. Each layer owns its error taxonomy.
4. **Configuration over code.** Timeouts, thresholds, and limits are
   configuration, never literals in logic.
5. **Injectable clocks.** Any module that measures time accepts a
   clock interface, so tests are deterministic.
6. **No `any`.** Strict TypeScript end to end. `unknown` plus type
   guards where the shape is dynamic.

## Engine Modules

Beyond the base structure, layers carry dedicated engine modules —
algorithmic cores that implement the layer's real behavior. A few
examples, chosen from different layers:

### Consistent Hash Ring (`load-balancer`)

A sorted array of hash positions, each owned by a backend. Virtual
nodes spread each backend's ownership across the ring. Routing is a
binary search: O(log n). Adding or removing a backend moves only
~1/n of the keys, which is the property that makes horizontal
scaling boring — in the best sense of the word.

### Schema Compiler (`validation`)

Declarative schemas are compiled once into native predicate closures.
There is no interpreter loop at validation time: the schema *is* the
closure. Cross-field rules (dependent required, if/then, mutually
exclusive) are compiled into the same closure graph, with dot-notation
error paths for precise failure reporting.

### Radix Trie (`router`)

Compressed path segments with static, parametric, and wildcard edges.
Specificity scoring (static > param > wildcard) resolves conflicts.
Route tables swap atomically via a single reference assignment, so
hot reload never serves a half-built table.

### Event Log (`event`)

Append-only, per-stream ordering, optimistic concurrency via expected
version. Projections consume the log with checkpoints; catch-up
subscriptions resume from a saved position. Upcaster chains migrate
old event versions to new shapes on read.

### Huffman + LZSS (`compression`)

Real bit-level codecs. Huffman builds the tree from symbol
frequencies with a binary min-heap and emits canonical codes; the
decoder walks the tree in O(L) per symbol. LZSS uses a hash-chain
match finder for O(n) amortized search over a sliding window. The
adaptive harness measures actual ratios per input and reports the
honest winner — including "store it raw" for incompressible data.

### Sharding Engine (`repository`)

Consistent-hash routing of entities to shards, scatter-gather query
fan-out with k-way merge, lag-aware read-replica selection, and a
query plan analyzer that flags full scans and missing indexes.
Rebalancing produces an exact key-move plan before any data moves.

### State Backend (`stream-processing`)

A pluggable keyed state store. The in-memory backend is trivial; the
LSM backend implements memtable flush, tiered compaction, tombstones
that drop only at the bottom level, bloom-filter read short-circuits,
and WAL replay. Window state migrates between partitions on rescale,
with a post-migration invariant check.

### Merkle Notarization (`audit`)

The audit log is a hash chain; periodic ranges are sealed into Merkle
roots and anchored to an external witness. Inclusion proofs verify any
record against any anchor in O(log n). Tampering breaks the chain;
forking breaks the anchors.

## Testing

Every layer carries `bun:test` suites. The conventions:

- AAA pattern (arrange, act, assert), no shared state between tests.
- Injectable clocks replace `Date.now()`; seeded PRNGs replace
  `Math.random()`.
- Error paths are asserted as precisely as success paths.
- Integration tests connect adjacent layer pairs through their public
  interfaces, using in-memory fakes for external systems.

Run everything:

```bash
bun test src/layers/
```

### Error Budget Burn Rate (`observability`)

The SLO tracker maintains a rolling window of successes and failures,
computes the burn rate against the budget, and projects the time to
exhaustion. Alert thresholds key off the burn rate, not the raw error
rate — the difference between paging on noise and paging on trend.

### Sherman-Morrison Update (`recommendation`)

The LinUCB bandit maintains the inverse of its design matrix
incrementally: each observation updates the inverse in O(d²) instead
of recomputing in O(d³). The UCB bonus is the model's own uncertainty,
which is why the exploration is principled rather than scheduled.

### Merkle Inclusion Proofs (`audit`)

A proof is the list of sibling hashes from a record to the root.
Verification recomputes the root from the record and the path; if it
matches the anchored root, the record is in the log. The proof size
is O(log n) — a few hundred bytes for a million records.

### Kahn's Algorithm (`scheduling`, `secrets-rotation`, `gitops`)

Layered topological sort: repeatedly take the nodes with no remaining
predecessors. The scheduler executes layers in parallel, the rotation
engine groups secrets into dependency waves, and the GitOps
reconciler creates parents before children and deletes them in
reverse. Cycle detection falls out for free — a leftover node is a
cycle.

### Little's Law (`performance-testing`)

L = λW: concurrency equals arrival rate times latency. The capacity
estimator inverts it — given a target latency and an observed arrival
rate, how many concurrent workers are needed? The formula is one
line; the discipline of measuring λ and W separately is the engine.

### Reservoir Sampling (`reporting`, `performance-testing`)

Vitter's Algorithm R: keep k items, replace the i-th with probability
k/i. A uniform random sample of any size stream in O(k) memory. The
dataset profiler and the latency percentile tracker both use it.

### Flajolet-Martin (`data-warehouse`)

Distinct-value counting with O(log log n) space: hash values, count
trailing zeros, the maximum observed zero-run estimates the cardinal.
Stochastic averaging and bias correction make it practical. Used for
join-order estimation in the query planner.

### Union-Find (`fraud-detection`)

Fraud rings are connected components: accounts sharing a device or a
card merge into the same set with path-compressed union-find. Ring
depth is the component size; the accounts in it are the ring.

### Bloom Filters (`stream-processing`)

The LSM state backend short-circuits reads of absent keys with a
bloom filter: k hash functions, m bits, no false negatives. A negative
answer saves a disk seek; a positive answer costs one.

### Ziegler-Nichols-Free Adaptive Control (`api-gateway`)

The Vegas-gradient flow controller grows concurrency while the queue
is short and shrinks it when the queue grows — the classic TCP Vegas
signal applied to request admission. No configuration of target
rates; the network's own delay tells the controller what to do.

### Haversine + Velocity (`fraud-detection`)

Impossible travel is the conjunction: great-circle distance divided
by elapsed time exceeds aircraft speed. The check is two floating-
point operations and one comparison; the discipline is keeping the
location history per account.

### Canonical JSON (`audit`)

Hash chaining requires byte-exact serialization: sorted keys, no
whitespace, stable number formatting. The canonical form is what the
chain hashes; any other form would fork the chain on a re-serialize.

### LEB128 + Zigzag (`serialization`)

The binary codec's integer format: little-endian base-128 varints,
with zigzag encoding mapping -1 to 1, 1 to 2, so small negatives stay
small. The standard compact format, implemented bit-exact.

### Welford (`anomaly-detection`, `siem`)

Online mean and variance in one pass, numerically stable, mergeable —
two Welford states can combine into the state of their union. The
behavioral baseline and the streaming z-score both build on it.

### Documentation Map

- `README.md` — project overview, setup, statistics
- `docs/ARCHITECTURE.md` — this document
- `docs/adr/` — architecture decision records
- `docs/operations/` — runbook, deployment guide, compliance
- `docs/openapi.yaml` — API specification
- `src/layers/<name>/docs/` — per-layer architecture, ADR,
  configuration, and testing guides
- `UNCLE_BOB.md` — a field study in Clean Architecture
- `GANG_OF_FOUR.md` — a field study in design patterns
- `RELEASE_NOTES.md` — the release

## Cross-Cutting Concerns

Beyond the pipeline layers, the repository carries the concerns that
apply to every layer at once:

### Configuration

Layered sources (defaults, file, environment, remote) merged by
precedence, validated against schemas, with secret masking in
serialized output, hot reload with change detection, `${ref}`
interpolation between keys, and per-environment overrides. Config
change history records who changed what, with rollback tombstones.

### Secrets

An encrypted vault (AES-256-GCM) with versioned secrets, lease
management for dynamic credentials, rotation scheduling with grace
windows, usage tracking, and anomaly detection on access patterns.
Rotation hooks reach into configuration through secret references.

### Governance

Data classification tiers, access review campaigns, retention
execution with legal-hold precedence, DSAR workflows, and compliance
report scheduling. The policy scanner checks configurations against
declared rules — the same rules the governance layer enforces at
runtime.

### Multi-Tenancy

Tenant context propagation through async storage, resolution by
subdomain/header/token claim, per-tenant configuration overlays,
isolation verification (leak detection), tier management with usage
validation, and saga-style atomic provisioning with compensating
rollback.

### API Versioning

Version extraction from headers, URLs, and query parameters; semver
comparison with prerelease ordering; deprecation schedules with RFC
8594 sunset headers; breaking-change detection against request and
response schemas; per-version rate limits; migration guide generation.

### Localization

Message catalogs with CLDR plural rules across six locales, ICU-style
message formatting, fallback chains (region, language, default),
translation memory with trigram matching, pseudo-localization for
testing, and quality scoring for missing keys and placeholder
mismatches.

### Observability

Signal routing with drop policies under pressure, head and tail
sampling, PII redaction pipelines, metric rollups into time buckets,
SLO tracking with burn-rate alerting, and telemetry cost estimation —
because the observability system is itself a system with costs.

### Testing Infrastructure

Four layers model the testing tools themselves: contract testing
(Pact-style verification with compatibility matrices), mutation
testing (real mutant execution through a tree-walking interpreter),
performance testing (reservoir percentiles, Welch t-tests, load
schedules), and property testing (QuickCheck with genuine shrinking,
stateful command sequences, seeded reproducibility).

## The Dependency Graph

The pipeline is a strict sequence, but the engines inside each layer
form their own graph. The rules that keep it acyclic:

1. Engines within a layer may compose each other through interfaces.
2. Engines never import across layers — cross-layer composition
   happens at the pipeline level, through the public interfaces.
3. Shared primitives (clocks, PRNGs, result types) live in each
   layer's own `types/` — duplication of forty lines beats a shared
   dependency that couples one hundred layers.

The last rule is deliberate. A shared `common` package would be the
conventional choice, and the conventional choice would couple every
layer to every other layer's clock. The duplication is the decoupling.

## Performance Characteristics

Measured characteristics of the pipeline stages, from the layer test
suites:

- Router matching: O(k) where k is the path segment count.
- Cache lookup (L1): O(1) with the LRU maintained by Map insertion
  order.
- Rate limit check (token bucket): O(1) — two numbers and a multiply.
- Validation (compiled schema): O(n) over the payload, zero schema
  interpretation at runtime.
- Specification compilation: O(spec size) once, then O(payload) per
  evaluation.
- Cursor pagination: O(log n) per page via sorted index seek.
- Consistent hash routing: O(log n) per key.
- Vector search (HNSW): O(log n) amortized with ef-beam search.
- Compression (LZSS): O(n) amortized with hash-chain match finding.
- Event append: O(1) with optimistic version check.

The pipeline adds latency in exchange for the guarantees each layer
makes. The guarantees are the product; the latency is the price,
and it is paid knowingly.

## Failure Modes

What happens when a layer fails, and what the pipeline does about it:

### A dependency is slow

The circuit breaker opens after the failure threshold, serves the
fallback chain, and probes half-open before recovering. The retry
layer backs off with decorrelated jitter and stops when its budget is
spent — a retry storm cannot starve the primary path.

### A dependency is down

The bulkhead caps the concurrency per consumer, so one dead dependency
cannot drain the shared pool. Requests beyond the cap queue with a
timeout and reject with a precise error, not a hang.

### Traffic spikes

The rate limiter sheds by policy — token bucket for bursts, sliding
window for fairness, penalty escalation for repeat offenders. The
load shedder drops lowest-priority requests first, with deadline
awareness.

### A message is poison

The consumer's inbox parks it after the failure threshold, with the
error signature recorded for clustering. The dead-letter queue holds
it for manual review or paced replay; the poison never loops.

### State is lost

The event store replays from the log; snapshots shortcut the replay.
Projections rebuild from checkpoints. The stream processor recovers
window state from the WAL and verifies exactly-once with idempotency
keys. Nothing depends on memory being telling the truth.

### Data is corrupted

Checksums per segment, hash chains per log, Merkle roots per range.
The corruption detector localizes the first mismatch; the backup
verifier restores to scratch and compares. Detection is not optional
and it is not best-effort.

### A deploy goes wrong

The canary gate compares error rate, latency, and saturation against
the baseline with statistical tests, and rolls back on breach. Blue-
green keeps the previous environment warm; the rollback is a traffic
switch, not a rebuild.

### A secret leaks

The rotation engine revokes immediately, re-keys the affected data
with envelope encryption, and the crypto-shredding path renders the
old ciphertext unreadable. The blind index re-keys with the new HMAC
key. The audit log records who accessed what, when.

### The config is wrong

The validator rejects it before it loads, the drift detector flags it
if it loads anyway, and the change history supports rollback to the
last known good value. Config changes are data, and data has versions.

## Operational Notes

### Starting the server

```bash
bun run start:dev
```

The server binds the configured port, wires the pipeline through the
composition root, and reports the layer count on the version endpoint.

### Endpoints

- `GET /` — the greeting, in the requested language.
- `GET /version` — layer count and build metadata.
- `GET /health` — aggregated health across layers.
- `GET /metrics` — Prometheus exposition format.

### Health checks

Each layer's health check reports status, latency, and details. The
aggregator computes the weakest-link verdict: one unhealthy layer
makes the deployment unhealthy, which is the point — a pipeline is
only as healthy as its slowest lie.

### Metrics

Every layer exposes counters (operations), gauges (state), and
histograms (durations). The exposition format is Prometheus text;
the cardinality guard keeps label combinations bounded, because a
metrics system that cannot bound itself becomes the incident.

### Tracing

Every layer opens a span. The traceparent propagates; the spans form
a tree; the tail sampler keeps the interesting traces and drops the
noise. The critical path through a trace is the longest dependency
chain — the place to look first when latency regresses.

## Design Decisions Worth Recording

The decisions that shaped the repository, in the order a newcomer
would ask about them:

### Why is the domain so small?

Because the domain is the part that must be right, not the part that
must be large. The greeting policy validates the language, formats
the message, and stamps the audit fields. Everything else in the
repository exists to give that policy a reliable place to run.

### Why so many layers?

Because each layer isolates one reason to change. The rate limiter
changes when the traffic pattern changes. The serializer changes when
the wire format changes. Neither changes when the greeting changes —
and that independence is the architecture.

### Why engines instead of one implementation?

Because a layer with one implementation is a layer with one opinion.
The cache with six eviction strategies can be tuned for the workload;
the cache with one strategy can be tuned for the benchmark. Engines
are the difference between a component and a decision.

### Why is duplication of small primitives allowed?

Because a shared clock module would couple one hundred layers to one
package. Forty lines of clock per layer is the price of the layers
being independently evolvable. The duplication is the decoupling.

### Why bun instead of node?

The test runner is faster, the TypeScript support is native, and the
runtime quirks (interface re-exports must be `export type`) are
documented in the development notes. The production target is
unchanged — the code compiles to JavaScript and runs anywhere Node
runs.

### Why is there no ORM?

Because the repository layer's specification compiler generates the
queries the domain needs, and an ORM would generate the queries the
ORM supports. The gap between those two sets is where the performance
problems live.

### Why is the error taxonomy per layer?

Because a 401 from the security layer and a 401 from the identity
provider are different events with different remediations. A shared
error hierarchy would collapse them; the per-layer taxonomy keeps the
remediation with the cause.

### Why are there no interfaces without implementations?

Because an interface without an implementation is a promise the
repository does not keep. Every interface in every layer has at least
one concrete class behind it, and every concrete class has at least
one test in front of it.

### Why does the cache layer have its own Prometheus exporter?

Because the metrics layer exposes the data and the cache layer knows
what the data means. The exporter translates cache statistics into
Prometheus format at the boundary — the cache never imports the
metrics layer, and the metrics layer never learns what a cache hit
means.

### Why do the adapters mock instead of using real SDKs?

Because the repository tests must run without a network. The adapter
interfaces are the seam: the in-memory adapter is the truth for tests,
the Redis adapter is the truth for production, and neither knows
which one it is.

### Why is the composition root the only place that wires layers?

Because a dependency graph that can be assembled anywhere can be
assembled wrong everywhere. The composition root is the one file that
knows the construction order, and the one file that fails loudly when
the order is wrong.

### Why do health checks return details?

Because `unhealthy` without a reason is a page without a runbook. The
details object carries the check that failed, the latency observed,
and the threshold breached — the three facts the on-call needs before
opening the dashboard.

### Why is the OpenAPI spec hand-maintained?

Because generated specs describe the framework's shapes, not the
contract's. The spec is the contract; the code implements it; the
tests verify both.

### Why are ADRs per layer?

Because the decision to use a radix trie in the router is a router
decision. A global ADR index links the per-layer records; the layer's
own `docs/adr.md` carries the reasoning where the code can find it.

### Why is the documentation in the repository and not a wiki?

Because a wiki drifts from the code silently, and a pull request
cannot be merged without the docs next to it. The docs that live with
the code are the docs that get updated with the code.

## Glossary of Pipeline Terms

The vocabulary a newcomer needs for the first week:

**Composition root** — the single place where the dependency graph is
assembled. Everything else receives its dependencies.

**Pipeline** — the ordered sequence of layers a request traverses.
The order is the architecture.

**Boundary** — the interface between two layers. Crossings are typed,
directed, and counted.

**Engine** — a layer's algorithmic core module: the real behavior,
as opposed to the structural scaffolding.

**Strategy** — an interchangeable algorithm selected by a factory.

**Specification** — a composable predicate that encodes a business
rule and compiles to both a predicate and a query.

**Aggregate** — a cluster of domain objects with a root and a version,
the unit of consistency and of concurrency control.

**Projection** — a read model derived from events, with a checkpoint
marking how far it has consumed.

**Checkpoint** — the saved position from which processing resumes.
Crash, replay, continue.

**Compensation** — the undo step of a saga, executed in reverse order
when the forward path fails.

**Bulkhead** — the concurrency cap that isolates one consumer's
overload from another's capacity.

**Backpressure** — the propagation of downstream slowness upstream,
via watermarks and bounded queues.

**Watermark** — the stream-time frontier: events later than it are
late, and the policy for late data must be explicit.

**Idempotency** — the property that running an operation twice has
the same effect as running it once. The precondition for safe retries.

**Optimistic concurrency** — the version check that rejects stale
writes without holding locks.

**Single-flight** — the collapse of concurrent identical calls into
one execution, with the result shared.

**Stampede** — what happens to the origin when a hot key expires and
a thousand requests arrive. Prevented by single-flight.

**Poison message** — the message that crashes its consumer, parked for
manual review rather than looped.

**Fencing token** — the monotonic lease number that makes leader
election safe against zombie workers.

**Tombstone** — the deletion marker that survives compaction until
the bottom level.

**Quorum** — the approval count for two-person rules and the commit
threshold for failover.

**Blast radius** — the fraction of the system an experiment may touch,
capped before the experiment starts.

**Steady state** — the metrics that must hold during a chaos
experiment, checked with a statistical test, not an eyeball.

## Final Notes

This document describes the system as it is, not as it was planned.
Where the plan and the repository disagreed, the repository won — and
this document was corrected.

The pipeline is the architecture. The layers are the units. The
engines are the substance. The tests are the proof. The documentation
is the map.

Everything else is commentary.

Run the tests. Read a layer. Curl the endpoint.

The greeting is ready.

---

## Appendix: Layer Interaction Matrix

Which layers call which, as the pipeline wires them:

- `network` receives bytes and hands parsed streams to `http-parser`.
- `http-parser` hands structured requests to `security`.
- `security` clears requests for `rate-limiting`.
- `rate-limiting` admits requests into `validation`.
- `validation` passes clean payloads to `middleware`.
- `middleware` enriches context for `router`.
- `router` selects the handler in `controller`.
- `controller` invokes the use case in `service`.
- `service` enforces the policy through `domain`.
- `domain` persists through `repository`.
- `repository` accelerates reads through `cache`.
- `domain` publishes through `event`.
- `event` fans out through `message-queue`.
- `message-queue` feeds `data-transformation` for async flows.
- responses flow back through `serialization`, `compression`,
  `circuit-breaker`, `retry`, `saga`, `strategy`, `facade`, `proxy`,
  `decorator`, and `transport`.

The horizontal layers — analytics, audit, configuration, observability,
and the rest — observe and configure the pipeline without being part
of the request path. They are the audience, not the actors.

## Engine Catalog, Continued

More engine modules, one paragraph each, chosen to show the range of
algorithms the repository carries:

### Token Bucket with Lazy Refill (`rate-limiting`)

The bucket stores `{tokens, lastRefillMs}` — a serializable state
pair. Refill happens lazily on read: `tokens += (now - lastRefill) ×
rate`, capped at capacity. Because the state is two numbers, the
bucket ships to a distributed store and every node computes the same
answer without coordination.

### Welch's t-test (`strategy`, `chaos-engineering`)

The canary verdict and the chaos steady-state check both compare two
samples without assuming equal variances. The implementation computes
Welch's statistic directly, with Lanczos log-gamma and a continued-
fraction regularized incomplete beta function for exact p-values —
no lookup tables, no approximations.

### Fellegi-Sunter Resolution (`identity`)

Duplicate accounts are linked probabilistically: each field agreement
or disagreement contributes a log-likelihood ratio, summed into a
match score. Blocking keys (Jaro-Winkler on normalized names) keep
the comparison space tractable — O(n × block size) instead of O(n²).

### ImplicitALS (`ml-feature-store`)

Implicit-feedback matrix factorization solved by alternating least
squares: fix items, solve users by ridge regression with Gaussian
elemination; fix users, solve items; repeat. The Gaussian elimination
is real — no iterative shortcuts — which makes the solution exact
per iteration and the convergence monotone.

### HNSW (`search`)

A navigable small-world graph over embedding vectors. Insertion draws
a level geometrically, greedily descends from the top layer, and
links bidirectionally with bounded degree on the base layer. Search
is beam search with an ef parameter trading recall for latency.
Tombstones keep deletions cheap; compaction rebuilds the graph.

### Rabin Fingerprint CDC (`backup`)

Content-defined chunking: cut points are where a rolling hash of the
content hits a boundary. Insertions shift boundaries only locally, so
unchanged blocks dedupe regardless of their offset in the file — the
property that makes incremental backups incremental.

### Timing Wheel (`message-queue`)

Delayed messages land in a ring of slots, one batch per clock tick.
Overflow rebuckets into coarser wheels rather than growing a heap.
Delivery is O(1) per tick, and the wheel's memory is bounded by the
longest delay divided by the tick interval.

### P² Quantile Estimation (`observability`)

Streaming percentiles with bounded markers: five markers adapt their
positions as observations arrive, keeping p50/p95/p99 accurate without
storing the stream. Used by the telemetry cost estimator and the
anomaly scorer.

### CUSUM (`data-quality`)

Cumulative sum change detection: the running sum of deviations from
the target mean crosses a bound when the distribution shifts. The
detector distinguishes drift direction and resets on alarm, which
makes it suitable for quality-score trend tracking.

### Rete Alpha Network (`rules-engine`)

Condition nodes are shared across rules: a fact that fails a condition
fails it once for every rule referencing that node. Field-indexed
skipping means a fact never reaches a rule whose indexed condition it
cannot satisfy.

### XACML Combining (`policy-engine`)

Decision merging with explicit algorithms: deny-overrides (any deny
wins), permit-overrides, first-applicable, and majority. Obligations
ride on the decision — log, notify, require MFA — and the engine
tracks which policy emitted which obligation.

### Two-Phase Commit (`message-queue`)

Atomic multi-queue send: stage messages on all target queues, vote,
then apply or abort. The staging area makes the vote idempotent, and
a coordinator timeout aborts automatically — no distributed lock
required.

### Fencing Tokens (`outbox`)

Leader election for relay workers uses monotonically increasing lease
tokens. A zombie relay holding a stale token is rejected by the store,
which only accepts writes bearing the current token. The classic
problem of split-brain relays, closed.

### Wait-For Graph (`unit-of-work`)

Deadlock detection builds a graph of which transaction waits on which,
and searches for cycles with DFS. The victim is the transaction with
the fewest locks — cheapest to abort — and the timeout fallback keeps
the detector from starving under contention.

### Isolation Forest (`anomaly-detection`)

An ensemble of random binary trees. Anomalies are isolated in fewer
splits, so the path length from root to leaf is the anomaly score.
The forest averages path lengths across trees; the implementation
uses real random splits and real path-length scoring.

### SymSpell (`search`)

Spelling correction via a delete-distance index: for each dictionary
term, precompute every string reachable by up to two deletions. A
misspelled query deletes its own characters, looks up candidates, and
ranks by frequency and distance — O(1) lookup per candidate.

### Point-in-Time Join (`ml-feature-store`)

Training labels join features as-of the label time, never after —
the join that prevents target leakage. The implementation binary-
searches each feature's history for the latest value at or before the
event time, per entity.

### Haversine Impossible Travel (`fraud-detection`)

Two logins from locations whose great-circle distance implies
impossible travel speed flag the account. The haversine formula runs
on the pair of coordinates; the velocity check runs on the pair of
timestamps.

### GFS Retention (`snapshot`)

Grandfather-father-son: keep N daily, fewer weekly, fewer monthly,
with ISO-week deduplication so a snapshot counts as one week's son
regardless of which day it was taken. Depth-ordered deletion and
label protection keep restore chains intact.

### RCPSP Simulation (`bpmn`)

Resource-constrained project scheduling over the process model: tasks
compete for resource pools, the list scheduler respects precedence,
and the simulation answers what-if questions about capacity without
touching a running instance.

### Permessage-Deflate (`websocket`)

RFC 7692 compression negotiation with context takeover: the LZ77
sliding window persists across messages, so subsequent frames
compress better than the first. RSV1 bookkeeping marks compressed
frames; the negotiation intersects client and server offers.

### Blind Index (`encryption`)

Equality search over encrypted fields: the index stores HMAC of the
normalized value, not the value. Queries compute the HMAC of the
search term and match — the database never sees plaintext, and the
index never leaks it.

### Error Budget Burn Rate (`observability`)

The SLO tracker maintains a rolling window of successes and failures,
computes the burn rate against the budget, and projects the time to
exhaustion. Alert thresholds key off the burn rate, not the raw error
rate — the difference between paging on noise and paging on trend.
