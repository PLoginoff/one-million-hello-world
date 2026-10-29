# ADR: FraudDetection Layer

## Status
Accepted

## Decisions

### 1. Composable rules engine, not a monolithic scorer
Each check (velocity, amount anomaly, impossible travel, device, blocklist, threshold) is an `IFraudRule` emitting `RiskSignal`s. `FraudEngine` weights and aggregates them, then applies blocklist/allowlist overrides before the approve/review/decline decision. Rules can be added/tuned independently, and every signal is explainable — the decision carries its contributing signals.

### 2. Three-band decisions
`approve` / `review` / `decline` rather than binary — the middle band routes borderline scores to manual review, which is how real fraud ops work.

### 3. Physics-based impossible travel
Haversine distance vs elapsed time — a transaction 5000 km from the previous one 20 minutes later is flagged, no ML needed. Deterministic rules catch the unambiguous cases.

### 4. ML as a parallel path, not a replacement
`FeatureExtractor` + `LogisticScorer` (gradient-descent logistic regression) score transactions independently of the rules — useful for ranking the `review` queue and for signals rules miss, while rules remain the explainable primary.

### 5. Graph-based ring detection
`LinkAnalysis` exploits shared infrastructure (device/IP/merchant) — single-transaction signals can't see coordinated rings, a user↔attribute bipartite graph can.

### 6. Fingerprint similarity over equality
`DeviceSignals` scores partial matches — spoofed/emulated devices rarely reproduce every attribute, so similarity beats equality checks.
