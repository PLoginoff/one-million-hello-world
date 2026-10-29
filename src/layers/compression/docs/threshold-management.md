# Threshold Management

The "threshold" is `CompressionConfig.threshold` — a size cut-off in
**characters** below which compression is skipped. There is no
`ThresholdManager` class; it's a numeric field read in two places.

## Where it's used

`implementations/Compressor.ts`:

- `compress()` — `data.length < threshold` → returns `algorithm: NONE`,
  `ratio: 1`, passthrough. Short-circuits before algorithm selection.
- `selectAlgorithm()` — same check inside dynamic mode.

## Why

Compression has fixed overhead (headers, CPU). Below ~1 KB the savings
rarely justify the cost, and for the simulated codecs used here the
output would be *larger* (the `[ALG:len]` prefix). The default `1024`
is the point where compression typically wins.

## Configuring

```ts
compressor.setConfig({ threshold: 512 });
compressor.getConfig().threshold; // 512
```

`threshold` is merged into `_config` via `setConfig` (partial update).
Set it to `0` to compress everything; a very high value effectively
disables compression.

## Interaction with `ratio`

`ratio = compressedSize / originalSize`. Because the simulated envelope
adds a prefix, `ratio` will be `> 1` for `GZIP`/`BROTLI` — accurate for
the simulation, meaningless for real-codec sizing until `zlib` is wired
in.
