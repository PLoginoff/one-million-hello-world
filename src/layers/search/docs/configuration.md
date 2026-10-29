# Configuration: Search Layer

## SearchEngine options
`SearchEngine` (`implementations/index/SearchEngine.ts`) accepts
`SearchEngineOptions`:

| Option | Type | Description |
|--------|------|-------------|
| `tokenizer` | `Partial<TokenizerOptions>` | Overrides for `lowercase`, `minLength`, `removeStopWords` (default **true** in the engine), `stem`, `stopWords` |
| `bm25` | `Bm25Params` | BM25 tuning (`k1`, `b`) passed to `QueryExecutor` |
| `highlight` | `Partial<HighlightOptions>` | Snippet/highlight behavior passed to `Highlighter` |
| `defaultFields` | `readonly string[]` | Fields searched when a query has no `field:` clause |

## Layer defaults
`configuration/defaults/SearchDefaults.ts`:

```typescript
export const SearchDEFAULTS = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
  strategy: 'default',
  maxConcurrentExecutions: 100,
  cacheEnabled: true,
  cacheTtlMs: 60000,
  metricsEnabled: true,
  healthCheckEnabled: true,
  healthCheckIntervalMs: 30000,
} as const;
```

`SearchLIMITS` — bounds checked by `SearchConfigurationValidator`:

| Limit | Value |
|-------|-------|
| `minTimeout` / `maxTimeout` | 1,000 / 300,000 ms |
| `minRetries` / `maxRetries` | 0 / 10 |
| `maxConcurrentExecutions` | 1,000 |
| `maxCacheTtlMs` | 3,600,000 ms |

Valid `strategy` values: `'default'`, `'fast'`, `'reliable'`, `'cached'`,
`'batch'` (`SearchSTRATEGIES`).

## Builder and Validator
- `SearchConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `SearchConfigurationValidator` (`configuration/validators/`) —
  checks values against `SearchLIMITS` and `SearchSTRATEGIES`.
