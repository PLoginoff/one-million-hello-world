# ADR: GraphQL Layer

## Status
Accepted

## Decisions

### 1. From-scratch engine, no graphql-js dependency
Lexer, parser, SDL parser, validator, executor, and introspection are all implemented in-repo against the Oct 2021 spec. This keeps the layer dependency-free and makes every stage inspectable/testable; the tradeoff is that spec corners (subscriptions, custom directives, defer/stream) are deliberately unsupported.

*Alternative rejected:* wrapping `graphql-js` — adds a heavy dep and hides the mechanics this codebase exists to demonstrate.

### 2. Executable documents and SDL are separate parsers
`Parser` handles queries/mutations; `SchemaParser` handles SDL — they share `Lexer` primitives but produce different models (AST vs `TypeDef`). Keeping them separate avoids contorting one grammar for two purposes.

### 3. Validate before execute, with spec semantics
`Validation` runs all static checks before resolvers fire; `Executor` then implements the spec's execution semantics exactly — NonNull bubbling (a null non-null field nulls the parent), per-field error collection for partial results, `@skip`/`@include`, fragment cycles, variable coercion with defaults.

### 4. HTTP-shaped handler boundary
`GraphQLHandler` returns `{ status, body }` and transparently injects introspection resolvers, so transport code (HTTP parser layer upstream) stays transport-only.

### 5. Dual schema entry points
Schemas can be built programmatically (`schema/Schema.ts` — resolvers on `FieldDef`s) or parsed from SDL (`SchemaParser`) — tests use whichever is shorter; SDL is the natural authoring format, programmatic the natural embedding format.
