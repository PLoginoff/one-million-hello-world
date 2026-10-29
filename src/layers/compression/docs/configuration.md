# Configuration: Compression Layer

## Runtime config (`Compressor`)

`types/compression-types.ts` — the object `setConfig`/`getConfig`
manage:

```ts
interface CompressionConfig {
  defaultAlgorithm: CompressionAlgorithm;  // 'gzip' | 'brotli' | 'none'
  threshold: number;                       // chars; below → skip
  enableDynamic: boolean;                  // dynamic algorithm pick
}
```

Instance defaults: `defaultAlgorithm: NONE`, `threshold: 1024`,
`enableDynamic: false`.

## Presets (`configuration/defaults/CompressionDefaults.ts`)

`CompressionDefaults` provides `CompressionConfigDefaults` presets —
each is `{ algorithm: CompressionAlgorithm (value object), threshold:
CompressionThreshold (value object), enableMetrics, enableLogging,
defaultLevel }`:

| Preset | Algorithm | Threshold VO | Level |
|--------|-----------|--------------|-------|
| `getDefault()`          | gzip   | `createDefault()` | 6 |
| `getHighCompression()`  | brotli | `createStrict()`  | 9 |
| `getFastCompression()`  | gzip   | `createLenient()` | 1 |
| `getBalanced()`         | gzip   | `createDefault()` | 6 |
| `getDevelopment()`      | gzip   | `{minSize:512, maxSize:10MB, minRatio:0.9, maxTime:2000, dynamic:false}` | 4 |

`CompressionThreshold` (domain value object) wraps `minSize`,
`maxSize`, `minCompressionRatio`, `maxCompressionTime` and
`enableDynamicCompression` — a richer threshold than the primitive
`number` on `CompressionConfig`.

## Building & validating

`CompressionConfigurationBuilder` and `CompressionConfigBuilder`
(`configuration/builders/`); `CompressionConfigurationValidator` /
`CompressionConfigValidator` (`configuration/validators/`).

## Note on scope

The `CompressionConfig` above is what the running `Compressor` actually
consumes (`threshold` as a plain number of characters). The
`CompressionConfigDefaults` presets describe richer domain-level
profiles via `CompressionThreshold`/`CompressionAlgorithm` value
objects — pick one to seed `setConfig` or to drive a domain-level
policy.
