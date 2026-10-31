# Validation and Error Handling

## Overview
Validation is enforced inside `parse`/`parseExtended`/`validate` against `ParserConfig` limits and `ValidationRules`; failures return `ParseResult { success: false, error: ParseError }` rather than throwing. `ParseError` carries a `ParseErrorCode`, position info, and context.

## Validation Stages

### Request Line
- `HttpMethod`: `GET POST PUT DELETE PATCH HEAD OPTIONS TRACE CONNECT` — anything else → `INVALID_METHOD` (also gated by `allowedMethods` in `ExtendedParserConfig`/`isMethodAllowed`).
- URI must be non-empty, start with `/`, contain no control chars → `INVALID_HEADER`/`MALFORMED_REQUEST`.
- `HttpVersion`: `HTTP/1.0`, `HTTP/1.1`, `HTTP/2.0` (`allowHttp2` gates 2.0) → `INVALID_VERSION`.

### Headers
- Names: `[a-zA-Z0-9-]+`, length ≤ `ValidationRules.maxHeaderNameLength`.
- Values: no control chars (except SP/HTAB), length ≤ `maxHeaderValueLength`.
- `maxHeaderCount`, `maxHeaderSize` caps; `requiredHeaders`/`forbiddenHeaders` from `ValidationRules` (`validateHost`, `validateUserAgent` flags).
- `content-length`: non-negative integer ≤ `maxBodySize` → `INVALID_BODY`. `content-type`: parsed via `parseMimeType`, `validateContentType` + `isContentTypeAllowed`/`allowedContentTypes`.

### Body
- Size ≤ `ParserConfig.maxBodySize` → `INVALID_BODY`.
- `allowEmptyBody`/`allowChunkedEncoding`/`strictMode` toggles; JSON bodies parse-checked when `validateContentType` is on.

## Error Shape

```typescript
enum ParseErrorCode {
  INVALID_METHOD, INVALID_VERSION, INVALID_HEADER,
  INVALID_BODY, MALFORMED_REQUEST, INCOMPLETE_DATA,
}

interface ParseError {
  code: ParseErrorCode;
  message: string;
  position?: number;   // byte offset in raw buffer
  details?: string;
}
```

`parse` returns `ParseResult<HttpRequest>`: `success`, `request?`, `error?`. `parseExtended` adds `warnings: ParseWarning[]` and `metrics`.

## Warnings

Non-fatal issues surface as `ParseWarning { code, message, field?, value? }` on `ExtendedParseResult` and via `getWarnings()`/`addWarning()`/`clearWarnings()`. Warnings mark tolerated deviations (deprecated headers, unusual values, near-limit sizes) — the parse still succeeds.

## Stats and Recovery

`getStats(): ParsingStats` tracks `totalRequestsParsed`, `errorCount`, `parseErrors: Map<ParseErrorCode, number>`, `averageParseTime`. `resetStats()` clears. On `INCOMPLETE_DATA` the parser can buffer more input (`ParserState` persists); `resetState()` aborts and resets.

## Configuration

```typescript
parser.setValidationRules({
  requiredHeaders: ['host'],
  forbiddenHeaders: ['x-internal-secret'],
  maxHeaderNameLength: 64, maxHeaderValueLength: 4096,
  allowEmptyBody: false, validateContentType: true,
  validateContentLength: true, validateHost: true, validateUserAgent: true,
});

parser.setDefaultConfig({ maxBodySize: 1_000_000, maxHeaderCount: 100, strictMode: true });
```

## Best Practices

- Map `ParseErrorCode` to HTTP status (`INVALID_METHOD`/`INVALID_HEADER` → 400, `INVALID_BODY` → 413, `INCOMPLETE_DATA` → keep reading).
- Use `strictMode` on public endpoints; relax with `ValidationRules` for internal traffic.
- Review `parseErrors` stats weekly — repeated `INVALID_HEADER`/`INVALID_BODY` signals an attack or client bug.
- Treat `warnings` as signal, not noise — `LARGE_PAYLOAD`/`DEPRECATED` warnings precede errors.
