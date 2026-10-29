# Testing: Recommendation Layer

## Test Files

### `__tests__/`
- `Recommenders.test.ts` — the real recommender suite: `RatingMatrix`,
  cosine/Pearson similarity, `UserBasedCF`, `ItemBasedCF`,
  `ItemProfileStore` + `ContentBasedRecommender`, `MatrixFactorization`,
  `PopularityRecommender`, `ColdStartRecommender`, `HybridRecommender`.
- `RecommendersExtended.test.ts` — additional coverage of implicit
  feedback (co-occurrence, sequential, `ImplicitALS`) and evaluation
  metrics.
- `Recommendation.test.ts` — generic `Recommendation` implementation:
  execute/configure/getStatus.
- `RecommendationStrategies.test.ts` — the five generic strategies.
- `RecommendationConfiguration.test.ts` — builder and validator.

### `domain/__tests__/`
- `RecommendationDomain.test.ts`, `RecommendationExtendedDomain.test.ts` —
  entities and value objects.
- `RecommendationPatterns.test.ts` — specifications, decorators, pipeline.
- `RecommendationServices.test.ts` — domain/execution/query/validation
  services.

## Running Tests

```bash
bun test ./src/layers/recommendation/
```

Single file:

```bash
bun test ./src/layers/recommendation/__tests__/Recommenders.test.ts
```

## Test Approach
- Small hand-computed rating matrices make expected neighbor sets and
  ranked outputs deterministic.
- Evaluation tests use `trainTestSplit` and `looHitRate` on controlled
  fixtures so metric values are reproducible.
- Generic layer tests follow the shared contract: `execute` returns
  `{success, data}`, `configure` merges, `getStatus` exposes metrics.
