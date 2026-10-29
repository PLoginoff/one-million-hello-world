# Recommendation Layer Architecture

## Responsibility
Recommendation engine with collaborative and content-based filtering.

## Position
ML Layer 1

## Structure

```
recommendation/
├── index.ts                                — barrel export
├── implementations/
│   ├── Recommendation.ts                   — generic execute/configure/getStatus impl
│   ├── recommend/                          — explicit-feedback recommenders
│   │   ├── Types.ts                        — RatingMatrix, IRecommender, ScoredItem
│   │   ├── Similarity.ts                   — cosine & Pearson over sparse vectors
│   │   ├── CollaborativeFiltering.ts       — UserBasedCF, ItemBasedCF
│   │   ├── ContentBased.ts                 — TF-IDF item profiles + user profile
│   │   ├── MatrixFactorization.ts          — SGD latent-factor model
│   │   └── Hybrid.ts                       — Popularity, ColdStart, Hybrid
│   ├── implicit/
│   │   └── ImplicitCF.ts                   — Cooccurrence, Sequential, ImplicitALS
│   └── evaluation/
│       └── Metrics.ts                      — RMSE/MAE, precision@k, NDCG, MAP...
├── interfaces/IRecommendation.ts
├── strategies/                             — default / fast / reliable / cached / batch
├── factories/RecommendationStrategyFactory.ts
├── configuration/                          — builders, defaults, validators
├── domain/                                 — entities, events, handlers, policies,
│                                             specifications, value objects, services
├── adapters/                               — InMemory, Mock, Stub
├── health/RecommendationHealthCheck.ts
├── metrics/RecommendationPrometheusMetricsCollector.ts
├── statistics/RecommendationMetricsCollector.ts
├── types/recommendation-types.ts
└── utils/                                  — RecommendationError, RecommendationErrorMapper
```

## Core Types (`recommend/Types.ts`)

- **`RatingMatrix`** — sparse user×item rating store (per-user and
  per-item maps). `IRecommender` is the common interface:
  `fit(matrix)` + `recommend(userId, opts)` → `ScoredItem[]`.

## Similarity (`recommend/Similarity.ts`)

`cosineSim` and `pearsonSim` over `SparseVector` (`ReadonlyMap<string,
number>`). Pearson returns 0 when fewer than `minOverlap` keys are shared.

## Explicit-Feedback Recommenders (`recommend/`)

- **`UserBasedCF`** — k-NN by user similarity; predicts via weighted
  neighbor ratings. Cosine or Pearson.
- **`ItemBasedCF`** — item-item similarity (cosine, Pearson, or
  adjusted-cosine); scores from the user's own ratings of similar items.
- **`ContentBasedRecommender`** — item content → TF-IDF vectors via
  `ItemProfileStore`; user profile aggregated from highly rated items.
- **`MatrixFactorization`** — Koren-style baseline + factors model
  `r_ui ≈ μ + b_u + b_i + p_u · q_i`, trained by SGD with L2
  regularization (`MfOptions`: factors, epochs, lr, reg).
- **`PopularityRecommender`** — global popularity fallback.
- **`ColdStartRecommender`** — wraps a primary recommender and falls back
  to popularity for unseen users (`ColdStartOptions`).
- **`HybridRecommender`** — weighted blend of multiple `IRecommender`
  components (`HybridComponent[]`).

## Implicit-Feedback (`implicit/ImplicitCF.ts`)

- **`InteractionStore`** — click/view/purchase events with weights.
- **`CooccurrenceRecommender`** — item-item co-occurrence with
  lift/confidence scoring `co(i,j)/(n_i·n_j)^alpha`, cosine-normalized
  variant available.
- **`SequentialRecommender`** — next-item suggestions from ordered
  sessions.
- **`ImplicitALS`** — Hu-Koren-Volinsky weighted matrix factorization via
  alternating least squares; each ALS step solves the normal equations
  directly (`solveLinearSystem`, Jacobi iteration — no external solver).

## Evaluation (`evaluation/Metrics.ts`)

- `trainTestSplit` — hold-out split of a `RatingMatrix`.
- `ratingError` — RMSE and MAE for prediction accuracy.
- `rankingMetrics` — precision@k, recall@k, MAP, NDCG.
- `catalogCoverage` — fraction of items ever recommended.
- `looHitRate` — leave-one-out hit rate.

## Generic Pipeline & Domain

`Recommendation` (in `implementations/`) implements the uniform
`IRecommendation` contract; five generic strategies plus
`RecommendationStrategyFactory` satisfy the shared layer structure.
`domain/` holds the DDD scaffolding (entities, CQRS handlers,
specifications, policies, decorators, pipeline, in-memory repository).

## Testing
See [testing.md](testing.md).
