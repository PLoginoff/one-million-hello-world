# ADR: Recommendation Layer

## Status
Accepted

## Context
The product needs recommendations from both explicit ratings and implicit
signals (clicks/purchases), evaluated offline with standard metrics.

## Decisions

### 1. Sparse `RatingMatrix` as the shared input
All explicit-feedback recommenders consume the same `RatingMatrix` built
from `Rating` records. One ingestion path serves every algorithm, so
swapping recommenders is a constructor change, not a data migration.

### 2. `IRecommender` interface for uniform ranking
Every algorithm implements `fit` + `recommend(userId, opts) →
ScoredItem[]`. This is what makes `HybridRecommender` (weighted blend)
and `ColdStartRecommender` (fallback wrapper) possible without
algorithm-specific glue.

### 3. Neighborhood and latent-factor models side by side
`UserBasedCF`/`ItemBasedCF` cover the interpretable k-NN case;
`MatrixFactorization` (SGD, bias + factors) covers the higher-recall
latent-factor case. Both are useful in different data densities, so both
are shipped.

### 4. Content-based via TF-IDF over item profiles
`ContentBasedRecommender` vectorizes item text/features with TF-IDF and
builds a user profile from their highly rated items — the standard
approach when interaction data is thin.

### 5. Implicit feedback as a separate module
Clicks/views lack ratings, so `implicit/` provides its own algorithms:
co-occurrence (cheap, strong baseline), sequential (next-item), and
`ImplicitALS` (Hu-Koren-Volinsky confidence-weighted ALS). The ALS solver
uses direct normal-equation solving rather than an external linear
algebra dependency.

### 6. Evaluation included, not bolted on
`evaluation/Metrics.ts` ships RMSE/MAE, precision@k, recall@k, MAP, NDCG,
catalog coverage, and leave-one-out hit rate — enough to compare
recommenders offline without a separate framework.

## Consequences
- Real, usable recommenders for both feedback types with a coherent
  evaluation harness.
- Everything is in-memory and single-process; large catalogs need an
  external store and batch training.
- ALS solves small dense systems per iteration — fine at this scale, but
  not a distributed trainer.
