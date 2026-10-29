# Decompression

`Compressor.decompress(data, algorithm)` reverses the simulated codec
envelopes produced by `compress`. There is no `DecompressionEngine` or
error-handler class.

## `decompress(data, algorithm)`

```ts
decompress(data: string, algorithm: CompressionAlgorithm): CompressionResult
```

| `algorithm` | Behaviour |
|-------------|-----------|
| `NONE`    | returns `data` unchanged |
| `GZIP`    | strips `[GZIP:<len>]` prefix if present, else returns `data` |
| `BROTLI`  | strips `[BROTLI:<len>]` prefix if present, else returns `data` |
| other     | `{ success: false, error: 'Unsupported decompression algorithm' }` |

Result: `CompressionResult { success, data, algorithm }` — no
`originalSize`/`compressedSize`/`ratio` (decompression doesn't report
them).

## Envelope format

Produced by `compress`: `"[GZIP:42]<payload>"`, `"[BROTLI:7]<payload>"`.
`decompress` locates the `]`, parses the length (currently ignored —
the prefix is informational), and returns the substring after it.

## Error paths

- Unknown `algorithm` → `{ success: false, error: 'Unsupported
  decompression algorithm' }`.
- Any thrown error inside the switch → `{ success: false, error:
  <message> }`.
- Malformed/missing prefix → `data` returned as-is (no error) — the
  implementation is lenient, not strict.

## Real codecs

These are simulated — see `compression-algorithms.md` for replacing
`_simulateGzip`/`_simulateBrotli` and their decompress counterparts
with `zlib`.
