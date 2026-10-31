# Request Parsing

## Overview
`HttpRequestParser` (`IHttpRequestParser`) parses raw HTTP/1.x bytes into `HttpRequest` per RFC 7230, in three phases: request line → headers → body. `parse(raw, config?)` returns `ParseResult<HttpRequest>`; `parseRequestLine`/`parseHeaders` expose the stages individually.

## Request Line

`METHOD SP REQUEST-URI SP HTTP-VERSION CRLF`

- `HttpMethod`: `GET POST PUT DELETE PATCH HEAD OPTIONS TRACE CONNECT`
- `HttpVersion`: `HTTP/1.0`, `HTTP/1.1`, `HTTP/2.0`
- Errors: `INVALID_METHOD`, `INVALID_VERSION`, `MALFORMED_REQUEST`.

```typescript
parser.parseRequestLine('GET /a?b=1 HTTP/1.1');
// { method: 'GET', path: '/a?b=1', version: 'HTTP/1.1' }
```

## Headers

`HEADER-NAME ":" OWS HEADER-VALUE OWS CRLF`

`parseHeaders(lines)` splits on the first colon, lowercases the name, trims the value, and stores in `Map<string, string>` for O(1) lookup. Validation: name/value length caps (`maxHeaderNameLength`/`maxHeaderValueLength`), `maxHeaderCount`, `maxHeaderSize`, control-char rejection; duplicates handled per RFC → `INVALID_HEADER`.

## Body

- **Content-Length** → fixed body up to `ParserConfig.maxBodySize` (`INVALID_BODY` over).
- **Transfer-Encoding: chunked** → `parseChunkedEncoding(body)` (gated by `allowChunkedEncoding`).
- **multipart/form-data** → `parseMultipartFormData(body, boundary)`.
- GET/HEAD typically carry no body; `allowEmptyBody` controls tolerance.

## Query, Cookies, MIME, Content-Disposition

```typescript
parser.parseQueryString('a=1&b=2');         // QueryString { parameters: QueryParameter[] }
parser.parseCookies('sid=1; theme=dark');   // ParsedCookies
parser.parseMimeType('application/json; charset=utf-8'); // MimeType { type, subtype, charset?, boundary? }
parser.parseContentDisposition('form-data; name="f"; filename="a.png"'); // ContentDisposition
```

## State Machine

`ParserState`: `REQUEST_LINE → HEADERS → BODY → COMPLETE`. `getState()` inspects; `resetState()` aborts. `INCOMPLETE_DATA` means the parser wants more bytes — feed the next chunk instead of failing.

## Performance

- Header map gives O(1) lookup; chunked parser is streaming (no full-body copy).
- `maxBodySize`/`maxHeaderSize`/`maxHeaderCount` bound memory per request.
- `getStats(): ParsingStats` tracks `totalRequestsParsed`, `averageParseTime`, `errorCount`.

## Best Practices

- Tune `ParserConfig` (`maxBodySize`, `strictMode`, `timeout`) to your payload profile.
- Use `parseExtended` for warnings + metrics (see `advanced-features.md`).
- Treat `INCOMPLETE_DATA` as "more input", not an error.
