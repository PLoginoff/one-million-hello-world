# Advanced Features

## Overview
Extended parsing on `HttpRequestParser` (`IHttpRequestParser`): chunked bodies, multipart form data, response parsing, extended results with warnings/metrics, and auxiliary configs (security headers, CORS, rate limits). Types live in `types/http-parser-types.ts`.

## Chunked Encoding

`parseChunkedEncoding(body): ChunkInfo[]` decodes `Transfer-Encoding: chunked` bodies — each `ChunkInfo` carries `size`, `data`, and parsed `extensions`.

```
chunk-size [; ext] CRLF chunk-data CRLF … 0 CRLF CRLF
```

```typescript
const chunks = parser.parseChunkedEncoding(rawBody);
// [{ size, data, extensions }, …, { size: 0 }] // 0-size terminator included
```

## Multipart Form Data

`parseMultipartFormData(body, boundary): MultipartFormData` splits a `multipart/form-data` body on `boundary` into `MultipartPart[]` (`headers`, `name`, `filename?`, `contentType?`, `data`). `parseContentDisposition(header)` yields `ContentDisposition { type, name, filename? }` for uploads.

```typescript
const { boundary } = parser.parseMimeType(req.headers.get('content-type')) ?? {};
const form = parser.parseMultipartFormData(body, boundary);
form.parts; // [{ name: 'file', filename: 'a.png', contentType: 'image/png', data }]
```

## Response Parsing

`parseResponse(raw)` / `parseResponseExtended(raw)` mirror the request path for `HttpResponse`/`ExtendedHttpResponse` (status line + headers + body). `validateResponse(response)` applies the same validation rules.

## Extended Results

`parseExtended(raw)` / `parseResponseExtended(raw)` return `ExtendedParseResult<T>`:

```typescript
interface ExtendedParseResult<T> {
  success: boolean;
  request?: T; error?: ParseError;
  warnings: ParseWarning[];     // also via getWarnings()/addWarning()/clearWarnings()
  metrics: ParseMetrics;        // bytesProcessed, headersParsed, bodyBytes, chunksParsed?, multipartParts?
  duration: number;
}
```

`ExtendedHttpRequest` adds `query: QueryString`, `cookies: ParsedCookies`, `mimeType`, `contentDisposition`, `chunks`, `multipart` on top of `HttpRequest`.

## Streaming & State

`getState(): ParserState` exposes the internal state machine (`REQUEST_LINE → HEADERS → BODY → COMPLETE`). `resetState()` returns to idle. `getStats(): ParsingStats` tracks throughput; `resetStats()` zeroes it.

## Config

- `setExtendedDefaultConfig(partial)` — baseline `ExtendedParserConfig`.
- `setSecurityHeadersConfig` — parses `strict-transport-security`, `x-frame-options`, `x-content-type-options`, `content-security-policy`, `referrer-policy`, `permissions-policy`.
- `setCorsConfig` — `Access-Control-Allow-*` extraction (`isOriginAllowed`).
- `setRateLimitConfig` — `x-ratelimit-limit/remaining/reset` and `retry-after`.
- `setValidationRules(rules)` / `getValidationRules()` — see `validation-error-handling.md`.

## Best Practices

- Use `parseExtended` in production — warnings + metrics surface malformed-but-tolerated input.
- Prefer `parseChunkedEncoding`/`parseMultipartFormData` over manual boundary/chunk scanning.
- Read `metrics.chunksParsed`/`multipartParts` to cap abusive uploads; enforce `ValidationRules.maxBodySize`.
- Reuse the parser — `resetState` between connections, `resetStats` at boundaries.
