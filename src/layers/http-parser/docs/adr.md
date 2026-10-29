# ADR: HTTP Parser Layer

## Status
Accepted

## Context
Layer 2 must turn raw network buffers into structured `HttpRequest` objects for the security layer — strict RFC handling, bounded parsing, and rich error reporting are all security-relevant.

## Decisions

### 1. `ParseResult` over exceptions
`HttpRequestParser` returns `ParseResult { success, data?, error? }` with `ParseErrorCode`s, error positions, warnings, and counts — a malformed request is a *result*, not a throw, so the security layer decides how to handle bad input.

### 2. Strict vs lenient modes
`ParserConfig.strictMode` gates RFC compliance enforcement (method/version enums, header format rules). Strict for production edges, lenient for tolerant ingestion.

### 3. Bounded parsing by default
`maxHeaderSize`/`maxBodySize` limits exist to bound memory under hostile input — parsing is a DoS surface, so limits are config-first, not optional.

### 4. Extended parse as a separate config/result
`ExtendedParserConfig`/`ExtendedParseResult` carry query strings, cookies, MIME types, chunked bodies, and multipart form data — the common path stays lean while the rich parse is opt-in.

### 5. Self-diagnostics built in
`ParserState`, `ParsingStats`, `ParseWarning[]`, `ParserHealthStatus`, `ParserDiagnostics`, and `ParseMetrics` are tracked on the parser — a security-boundary component must be observable to be trusted.

### 6. Security knobs co-located
`SecurityHeadersConfig`, `CorsConfig`, `RateLimitConfig`, `ValidationRules` live with the parser — the first layer that sees hostile input owns the policy surface.

## Consequences
- Hostile-input handling is structured (error codes + bounds), not exceptional
- Rich feature set (~40 types) — the parser is the widest interface in the lower stack
