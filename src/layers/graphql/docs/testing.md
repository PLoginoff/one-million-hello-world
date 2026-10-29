# Testing: GraphQL Layer

## Running tests

```bash
bun test ./src/layers/graphql/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `GraphQLEngine.test.ts` | Lexer → parser → validation → executor: queries, mutations, fragments, variables, `@skip`/`@include`, NonNull bubbling, partial-result errors, introspection |
| `GraphQLSdl.test.ts` | `SchemaParser`: type/enum/input/interface/union/scalar definitions, field args, defaults, `schema {}` blocks |
| `Graphql.test.ts` | `IGraphql` contract: `execute()` result shape, error path, `getStatus()` |
| `GraphqlStrategies.test.ts` | Five generic strategies + `GraphqlStrategyFactory` |
| `GraphqlConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `GraphqlDomain`, `ExtendedDomain`, `Services`, `Patterns` cover the domain model.

## Conventions
- Engine tests build schemas via `SchemaParser` + inline resolvers — no external schema files or network.
- Spec semantics are asserted directly (e.g. a null NonNull field nulls its parent; error arrays accompany partial `data`).
