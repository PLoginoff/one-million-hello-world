# Configuration: HTTP Parser Layer

## ParserConfig (`types/http-parser-types.ts`)

| Option | Effect |
|--------|--------|
| `strictMode` | Enforce RFC compliance — method/version enums, header format rules |
| `maxHeaderSize` | Header-section byte limit (DoS bound) |
| `maxBodySize` | Body byte limit |

## ExtendedParserConfig
Gates the rich parse: query strings, cookies, MIME types, chunked bodies, multipart form data — opt-in so the common path stays lean.

## Policy configs (co-located with the parser)
- `ValidationRules` — configurable header/content checks
- `SecurityHeadersConfig` — required/inspected security headers
- `CorsConfig` — origin validation
- `RateLimitConfig` — parse-rate limiting

## Runtime behavior
`HttpRequestParser` holds `ParserState`, `ParsingStats`, `ParseWarning[]`, and `ParseMetrics` — diagnostics and health (`ParserHealthStatus`, `ParserDiagnostics`, `DiagnosticStep`/`Summary`) are inspectable at runtime.

## Layer defaults
`DEFAULT_HTTPPARSER_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

Config builders and validators live under `configuration/`.
