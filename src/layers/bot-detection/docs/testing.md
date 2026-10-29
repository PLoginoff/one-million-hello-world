# Testing: Bot Detection Layer

## Test files

Signal-level (`__tests__/`):

- `UserAgentSignal.test.ts` — known-bot allowlist, suspicious patterns
  (curl, scrapy, headless…), structural anomalies.
- `RequestFrequencySignal.test.ts` — burst and sustained thresholds,
  sliding-window pruning, per-IP isolation.
- `TimingEntropySignal.test.ts` — CV thresholds, `minSamples` gating,
  human-like jitter vs periodic traffic.
- `HeaderConsistencySignal.test.ts` — missing header penalties,
  UA/header contradictions.
- `HoneypotAndAggregator.test.ts` — honeypot trip → `known-bot`,
  legitimate hidden fields ignored, aggregator weighting, smoking-gun
  override, band classification.

Layer-level (`__tests__/`):

- `BotDetection.test.ts` — the `IBotDetection` contract.
- `BotDetectionStrategies.test.ts` — generic strategies and
  `BotDetectionStrategyFactory`.
- `BotDetectionConfiguration.test.ts` — defaults, builder, validator.

Domain (`domain/__tests__/`):

- `BotDetectionDomain.test.ts`, `BotDetectionExtendedDomain.test.ts`,
  `BotDetectionServices.test.ts`, `BotDetectionPatterns.test.ts` —
  entities, value objects, services, specifications, policies,
  repository, pipeline, mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/bot-detection/
```

or the signals only:

```bash
bun test ./src/layers/bot-detection/__tests__/HoneypotAndAggregator.test.ts
```

## Conventions

- Tests construct `BotSignalInput` literals directly — no fixtures.
- Stateful signals (`RequestFrequencySignal`, `TimingEntropySignal`) are
  tested with controlled `at` timestamps so no real time passes.
- Aggregator tests use stub `IBotSignal`s (`fixedSignal`) to verify the
  weighting math independent of concrete signals.
