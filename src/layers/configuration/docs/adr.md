# ADR: Configuration Layer

## Status

Accepted

## ADR-1: Key-lookup semantics in `execute`, not `get(key)`

**Context.** The layer contract is uniform across the codebase — a
single `execute(context)` method — while config resolution is
fundamentally `get(key) → value | not-found`.

**Decision.** Treat `context.input` as the key and return
`ConfigurationResult` with `{ success: true, data: { key, value,
source } }` on hit and `{ success: false, error: { code:
'CONFIG_NOT_FOUND' } }` on miss.

**Consequences.** Config resolution plugs into the same pipeline,
strategy and error machinery as every other layer; misses are typed
errors, not `undefined`.

## ADR-2: Source adapters — environment first, file second

**Context.** Twelve-factor apps read config from the environment;
file-based config is needed for local dev and tests.

**Decision.** `EnvConfigAdapter` maps a key to a prefixed, uppercased
`process.env` lookup (`APP_FOO` for prefix `APP` + key `foo`).
`FileConfigAdapter` resolves from an in-memory map seeded through
`configure({ values })`.

**Consequences.** Sources are interchangeable by swapping the adapter;
`FileConfigAdapter`'s in-memory map makes file resolution testable
without touching the filesystem.

## ADR-3: `cached` strategy as the default execution profile

**Context.** Config values change rarely relative to read rate.

**Decision.** The layer ships the standard five strategies; `cached`
(`priority 7`, memoizes repeated inputs) is the intended profile for
config lookups, selected via `ConfigurationStrategyFactory` or the
`strategy` config key.

**Consequences.** Repeated lookups short-circuit at the strategy layer
rather than re-walking env/file sources.

## ADR-4: Minimal common config

**Context.** The layer only needs cross-cutting operational knobs.

**Decision.** `DEFAULT_CONFIGURATION_CONFIG` carries `enabled`,
`timeout`, `retries`, `logLevel`.

**Consequences.** Configuration stays small; per-source settings (env
prefix, file path, values) go to the adapter's own `configure()`.
