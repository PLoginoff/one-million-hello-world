# Configuration: Router Layer

The real configuration type is `RouterConfig` in
`types/router-types.ts`.

## RouterConfig

| Option | Type | Description |
|--------|------|-------------|
| `caseSensitive` | `boolean` | Case-sensitive path matching |
| `strictRouting` | `boolean` | Strict trailing-slash handling |
| `allowWildcards` | `boolean` | Enable wildcard routes |
| `enableCaching` / `cacheTTL` | `boolean` / `number` | Cache match results |
| `enableMetrics` / `enableLogging` | `boolean` | Observability toggles |
| `maxRoutes` | `number` | Registry size cap |
| `defaultPriority` | `RoutePriority` | Fallback route priority |
| `defaultCache` | `CacheStrategy` | Default per-route cache strategy |

## RouteGroup

`RouteGroup` bundles routes under a `prefix` with optional `middleware`,
per-group `priority`, `cache`, and `rateLimit` scope — see
[route-matching.md](route-matching.md).

## Matching strategies

`strategies/strategy/` ships four `IRoutingStrategy` implementations —
`TrieRoutingStrategy`, `PrefixRoutingStrategy`, `RegexRoutingStrategy`,
`SequentialRoutingStrategy` — plus the generic pipeline strategies
(`Default`, `Fast`, `Reliable`, `Cached`, `Batch`) and decorator-style
`LoggingRouterStrategy`/`MetricsRouterStrategy` created via
`RouterStrategyFactory` / `RouterFactory`.
