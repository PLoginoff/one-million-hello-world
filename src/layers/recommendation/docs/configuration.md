# Configuration: Recommendation Layer

## Generic Layer Config

`RecommendationConfig` is not defined as a single bag — the layer's
generic implementation uses `RecommendationContext`/`RecommendationResult`
from `types/recommendation-types.ts`, and `configure` merges a `Record`.

## Recommender Options

### `UserBasedCF` / `ItemBasedCF` (`CfOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `similarity` | `'cosine' \| 'pearson' \| 'adjusted-cosine'` | `'cosine'` | Similarity metric (`adjusted-cosine` for items) |
| `k` | `number` | `40` | Neighborhood size |
| `minOverlap` | `number` | `2` | Min shared ratings for Pearson |

### `MatrixFactorization` (`MfOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `factors` | `number` | `32` | Latent dimension |
| `epochs` | `number` | `20` | SGD passes over ratings |
| `learningRate` | `number` | `0.01` | SGD step size |
| `regularization` | `number` | `0.02` | L2 penalty on biases/factors |

### `ImplicitALS` (`AlsOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `factors` | `number` | `32` | Latent dimension |
| `iterations` | `number` | `15` | ALS sweeps |
| `alpha` | `number` | `40` | Confidence scaling (Hu-Koren-Volinsky) |
| `regularization` | `number` | `0.01` | L2 penalty |

### `ColdStartRecommender` (`ColdStartOptions`)

`minRatings` (fallback threshold) plus the wrapped `primary` and
`fallback` recommenders.

### `HybridRecommender` (`HybridComponent[]`)

Each component is `{ recommender, weight }`; final score is the weighted
sum of component scores.

### `RecommendOptions` (per call)

`limit` (default 10), `excludeRated` (default true),
`minScore` filter.

## Generic Layer Config Keys

`enabled`, `timeout`, `retries`, `logLevel` — same shape as the shared
`{enabled, timeout, retries, logLevel}` layer config, via
`configuration/builders` and `configuration/validators`.
