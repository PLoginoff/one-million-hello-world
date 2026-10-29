# Bot Detection Layer Architecture

## Responsibility

Detect automated traffic from request metadata. The layer scores each
request with a set of pluggable *signals* and aggregates them into a
weighted `BotVerdict` with a classification of
`human | likely-human | suspicious | bot | known-bot`.

## Core model (`types/request.ts`)

- `BotSignalInput` — request snapshot: `clientIp`, `userAgent`,
  `headers`, `path`, `method`, `at`, optional `fingerprint` and
  `honeypotFields`.
- `IBotSignal` — `name`, `weight`, `evaluate(input) → SignalResult`,
  optional `tick(now)` for state maintenance.
- `SignalResult` — `signal`, `score` (0..1), `confidence` (0..1),
  `reason`.
- `BotVerdict` — aggregate `score`, `classification`, per-signal
  `signals`, top `reasons`. Built by `verdict()`.

## Signals (`strategies/`)

| Signal | File | Weight | What it measures |
|--------|------|--------|------------------|
| User-Agent    | `UserAgentSignal.ts`         | 3   | `KNOWN_BOTS` allowlist (Googlebot, Bingbot…), `SUSPICIOUS_UA_PATTERNS` (curl, scrapy, headless, sqlmap…), structural anomalies |
| Request frequency | `RequestFrequencySignal.ts` | 2 | Per-IP rate over a sliding window (`windowMs=10s`); `burstThreshold=5/s` → suspicious, `sustainedThreshold=20/s` → bot |
| Timing entropy | `TimingEntropySignal.ts`    | 2   | Coefficient of variation of inter-request gaps per IP; `veryRegularCv=0.05`, `suspiciousCv=0.15` |
| Header consistency | `HeaderConsistencySignal.ts` | 1.5 | Missing `Accept`/`Accept-Language`/`Accept-Encoding`, UA claims Chrome but no `Sec-CH-UA`, etc. |
| Honeypot      | `HoneypotSignal.ts`        | 4   | Hidden form fields (`email2`, `website`, `hp_*`) filled → near-certain bot; `legitimateHiddenFields` allowlist for CSRF tokens |

Each signal is configurable (`FrequencyConfig`, `TimingConfig`,
`HoneypotConfig`). `RequestFrequencySignal` and `TimingEntropySignal`
keep bounded per-IP state and prune on `tick(now)`.

## Aggregation

`BotScoreAggregator` (`strategies/BotScoreAggregator.ts`):

1. Runs every registered signal on the request.
2. **Smoking-gun rule** — any signal with `score ≥ 0.95` and
   `confidence ≥ 0.9` short-circuits to `known-bot` (honeypot trip,
   verified crawler).
3. Otherwise computes a weighted sum
   `Σ weight·score·confidence / Σ weight`, so low-confidence signals are
   discounted.
4. Maps the score to a band: `<0.20` human, `<0.40` likely-human,
   `<0.65` suspicious, `≥0.65` bot. Thresholds are configurable via
   `AggregatorConfig`.

Signals are registered/unregistered at runtime (`register`,
`unregister`, `signals`).

## Generic layer machinery

The layer also exposes the standard contract
(`IBotDetection.execute/configure/getStatus` in
`interfaces/`, `BotDetection` in `implementations/`), the five generic
strategies (`default`, `fast`, `reliable`, `cached`, `batch` via
`BotDetectionStrategyFactory`), a DDD domain module (entities, value
objects, services, specifications, policies, in-memory repository,
pipeline, decorators, event handlers), `InMemory`/`Mock`/`Stub`
adapters, configuration builders/validators,
`BotDetectionMetricsCollector`,
`BotDetectionPrometheusMetricsCollector` and
`BotDetectionHealthCheck`.
