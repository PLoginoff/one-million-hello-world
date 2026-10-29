# Configuration: Proxy Layer

The real configuration type is `ProxyConfig` in `types/proxy-types.ts`.

## ProxyConfig

| Option | Type | Description |
|--------|------|-------------|
| `enableAccessControl` | `boolean` | Intercept operations with permission checks |
| `enableLazyLoading` | `boolean` | Defer subject initialization until first use |
| `enableCaching` | `boolean` | Cache proxy results in an in-memory map |

See [access-control.md](access-control.md),
[lazy-loading.md](lazy-loading.md) and [caching-proxy.md](caching-proxy.md)
for the behavior each flag controls.

## Pipeline strategies

`ProxyStrategyFactory` creates the generic `IProxy` execution strategies:
`Default`, `Fast`, `Reliable`, `Cached`, `Batch`.
