# Compression Algorithms

Supported values live in `types/compression-types.ts`:

```ts
enum CompressionAlgorithm {
  GZIP = 'gzip',
  BROTLI = 'brotli',
  NONE = 'none',
}
```

## Implementation note — simulated codecs

`implementations/Compressor.ts` does **not** use `zlib`. `_simulateGzip`
and `_simulateBrotli` wrap the input in a tagged envelope and return it
unchanged:

- `_simulateGzip(data)` → `"[GZIP:<len>]<data>"`
- `_simulateBrotli(data)` → `"[BROTLI:<len>]<data>"`

This keeps the layer dependency-free and deterministic for tests; the
`compressedSize`/`ratio` it reports describe the *envelope*, not a real
codec's output. Swap in `zlib.gzipSync`/`brotliCompressSync` for real
compression.

## `compress(data, algorithm?)`

Behaviour in `Compressor.compress`:

1. If `data.length < config.threshold` (default `1024`) → returns
   `algorithm: NONE`, `ratio: 1`, data passthrough. Small payloads skip
   compression by design.
2. If resolved `algorithm` is `NONE` → passthrough.
3. `GZIP`/`BROTLI` → tag the data with the simulated envelope; any other
   value → `{ success: false, error: 'Unsupported compression
   algorithm' }`.
4. Result: `CompressionResult { success, data, algorithm,
   originalSize, compressedSize, ratio }` where `ratio =
   compressedSize / originalSize`.

## `decompress(data, algorithm)`

- `GZIP`/`BROTLI` → strips the `[ALG:len]` prefix if present.
- `NONE` → passthrough.
- Unknown → `{ success: false, error: 'Unsupported decompression
  algorithm' }`.

## `selectAlgorithm(data)`

Honours `config.enableDynamic`:

- `enableDynamic: false` → returns `config.defaultAlgorithm`.
- `data.length < threshold` → `NONE`.
- `_hasRepeatingPatterns(data)` (regex `/(.{10,})\1/`) → `GZIP`.
- otherwise → `NONE`.
