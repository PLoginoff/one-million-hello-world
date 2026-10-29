# ADR: Bot Detection Layer

## Status

Accepted

## ADR-1: Weighted multi-signal scoring instead of a single rule

**Context.** Bots are detected by combining weak evidence: a suspicious
UA alone isn't conclusive; regular timing alone isn't either; together
they are.

**Decision.** Each signal implements `IBotSignal.evaluate() →
{ score, confidence, reason }`. `BotScoreAggregator` computes
`Σ weight·score·confidence / Σ weight` — so confidence discounts the
contribution — and maps the aggregate to `human / likely-human /
suspicious / bot`.

**Consequences.** Adding a signal means implementing `IBotSignal` and
calling `register()`; no changes to the aggregator. Per-signal weights
make the system tunable without code changes to scoring.

## ADR-2: "Known-bot" as a separate class with a smoking-gun override

**Context.** Verified crawlers (Googlebot) and honeypot trips are
near-certain; they should not be averaged down by neutral signals, and
callers may want to treat verified crawlers differently from attackers.

**Decision.** A single signal with `score ≥ 0.95` and
`confidence ≥ 0.9` short-circuits the aggregate to
`classification: 'known-bot'`. `UserAgentSignal.KNOWN_BOTS` emits
high score for verified crawlers; `HoneypotSignal` (weight 4) emits
`score=1, confidence=0.95` on a trip.

**Consequences.** Deterministic, explainable verdicts for clear cases;
the `known-bot` class is distinguishable from `bot` downstream.

## ADR-3: Stateful, bounded per-IP signals with periodic `tick`

**Context.** Frequency and timing signals need history, but unbounded
per-IP maps would leak memory.

**Decision.** `RequestFrequencySignal` keeps a circular buffer of
timestamps per IP inside a `windowMs` sliding window (default 10 s).
`TimingEntropySignal` keeps the last `history` (20) inter-arrival gaps
per IP. Both prune inside `evaluate` and on `tick(now)`; the aggregator
forwards `tick` to all signals.

**Consequences.** O(1) amortized per event, bounded memory; callers must
invoke `aggregator.tick(now)` periodically to reclaim idle IPs.

## ADR-4: Five heuristic signals, no ML dependency

**Context.** Bot detection could use a trained model, but the codebase
has no ML runtime and needs explainable verdicts.

**Decision.** Implement five transparent heuristics — User-Agent,
request frequency, timing entropy, header consistency and honeypot —
each returning a human-readable `reason` that lands in
`BotVerdict.reasons`.

**Consequences.** Every verdict is auditable; thresholds are tunable via
each signal's config. Cost: sophisticated bots that mimic browser
headers and jitter can evade the current signal set — the
`fingerprint` field on `BotSignalInput` is reserved for a future signal.
