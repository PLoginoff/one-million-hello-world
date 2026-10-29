# Testing: HTTP Parser Layer

## Running tests

```bash
bun test ./src/layers/http-parser/
```

## Actual test files

`__tests__/`:

| File | Covers |
|------|--------|
| `HttpRequestParser.test.ts` | Core `parse()` — request line, headers, body, `ParseResult` shape, error codes |
| `HttpRequestParser.advanced.test.ts` | Extended parse — query strings, cookies, MIME types, chunked bodies, multipart |
| `HttpRequestParser.edge-cases.test.ts` | Malformed input, boundary conditions, size limits (`maxHeaderSize`/`maxBodySize`), error positions/warnings |
| `HttpRequestParser.integration.test.ts` | End-to-end parse flows incl. diagnostics/metrics |
| `HttpParserStrategies.test.ts` | Strategies + factory |
| `HttpParserConfiguration.test.ts` | Config builder/validator, defaults |
| `HttpParserTypes.test.ts` | Type-level coverage (`HttpMethod`, `HttpVersion`, `ParseErrorCode`, …) |

`domain/__tests__/` — `HttpParserExtendedDomain`, `HttpParserServices`, `HttpParserPatterns` cover the extended domain model.

## Conventions
- Raw request strings/buffers are built inline — no fixture files.
- Malformed-input tests assert `ParseResult.error.code` and position, not thrown exceptions.
- Advanced-feature tests enable `ExtendedParserConfig` explicitly.
