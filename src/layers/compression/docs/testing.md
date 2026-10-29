# Testing: Compression Layer

## Test files

Top-level (`__tests__/`):

- `Compressor.test.ts` — the implementation: `getConfig`/`setConfig`
  defaults and merge, `compress` (below-threshold passthrough, `GZIP`/
  `BROTLI` envelope output, `NONE`), `decompress` (envelope stripping,
  `NONE`, unsupported), `selectAlgorithm` (dynamic on/off, pattern
  detection).
- `CompressionConfiguration.test.ts` — `CompressionDefaults` presets,
  builders and validators.
- `CompressionStrategies.test.ts` — `ICompressionStrategy`
  implementations (`Default`, `Fast`, `Reliable`, `Cached`, `Batch`).

Domain (`domain/__tests__/`):

- `CompressionPatterns.test.ts` — mapper, decorators, observer and
  other domain patterns.

## Running

```bash
bun test ./src/layers/compression/
```

## Conventions

- Tests use the simulated codecs directly: assert `result.data`
  `toContain('[GZIP:')` / `[BROTLI:` rather than decoding.
- Threshold behaviour is tested by `setConfig({ threshold })` then
  `compress('a'.repeat(N))` with `N` around the boundary.
- `selectAlgorithm` dynamic mode is exercised with inputs crafted to
  (not) match `/(.{10,})\1/`.
- No `zlib`, no fixtures, no timers — all string literals.
