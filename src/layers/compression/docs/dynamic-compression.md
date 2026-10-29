# Dynamic Compression

Dynamic selection is a single method — `Compressor.selectAlgorithm` —
gated by `config.enableDynamic`. There is no `DynamicCompressor` or
`PatternDetector` class.

## How it works

```ts
selectAlgorithm(data: string): CompressionAlgorithm {
  if (!this._config.enableDynamic) {
    return this._config.defaultAlgorithm;
  }
  if (data.length < this._config.threshold) {
    return CompressionAlgorithm.NONE;
  }
  if (this._hasRepeatingPatterns(data)) {
    return CompressionAlgorithm.GZIP;
  }
  return CompressionAlgorithm.NONE;
}
```

## Decision rules

| Condition | Result |
|-----------|--------|
| `enableDynamic` off             | `defaultAlgorithm` — caller decides |
| `data.length < threshold`       | `NONE` — not worth compressing |
| Repeating pattern detected      | `GZIP` — compressible content |
| Large but no repeating pattern  | `NONE` — skips compression |

## Pattern detection

`_hasRepeatingPatterns` uses `/(.{10,})\1/` — true when any substring
of ≥10 chars repeats back-to-back. It's a cheap heuristic, not entropy
analysis; high-entropy-but-compressible data (e.g. JSON without runs)
returns `NONE`.

## Configuration

```ts
compressor.setConfig({
  defaultAlgorithm: CompressionAlgorithm.GZIP,
  threshold: 1024,
  enableDynamic: true,
});
compressor.selectAlgorithm(payload);
```

`threshold` is in characters (string length), not bytes.
