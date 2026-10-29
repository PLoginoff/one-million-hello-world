# GraphQL Layer Architecture

## Position
Layer 41. Responsibility: GraphQL query parsing and resolver orchestration — a complete from-scratch engine: lexer → parser → validation → execution → introspection. No external GraphQL dependency.

## Pipeline (`implementations/`)

| Stage | File | Role |
|-------|------|------|
| Lexer | `lexer/Lexer.ts` | Tokenizer per the Oct 2021 spec lexical grammar (`TokenKind` enum: punctuation, names, int/float/string/block-string literals) |
| AST | `ast/ast.ts` | Node definitions — `DocumentNode`, `OperationDefinitionNode`, `FragmentDefinitionNode`, selections, values |
| Parser | `parser/Parser.ts` | Recursive-descent parser for executable documents (queries, mutations, fragments, variables, directives) |
| SDL Parser | `sdl/SchemaParser.ts` | Parses schema definition language into the runtime `TypeDef` model: type/enum/input/interface/union/scalar defs, field args with defaults, `schema {}` blocks |
| Schema | `schema/Schema.ts` | Programmatic schema model: named types (scalars `Int/Float/String/Boolean/ID`, objects, enums, input objects), fields with resolvers, Query/Mutation roots |
| Validation | `execution/Validation.ts` | Static checks: fields exist, required args provided, leaf vs composite selection rules, fragment spreads valid, variables defined |
| Executor | `execution/Executor.ts` | Runs validated documents against resolvers: async resolvers, variable coercion with defaults, `@skip`/`@include`, named + inline fragments, aliases, list/null propagation with NonNull bubbling, per-spec partial-result error collection |
| Handler | `execution/GraphQLHandler.ts` | End-to-end `parse → validate → execute` returning an HTTP-shaped `{ status, body }`; injects `__schema`/`__type` resolvers for introspection queries |
| Introspection | `execution/Introspection.ts` | Standard `__schema`/`__type` result shape (`TypeKind`/`TypeRef` nesting) for tooling |

## Layer Contract
`IGraphql` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()`. `Graphql` (`implementations/Graphql.ts`) returns `GraphqlResult` (`{ success, data?, error? }`, code `GRAPHQL_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime`.

## Generic Processing Strategies
`default`, `fast`, `reliable`, `cached`, `batch` — `IGraphqlStrategy` implementations via `GraphqlStrategyFactory`.

## Domain Model (`domain/`)
Entities (`GraphqlEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects, domain/execution/query/validation services, events, handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_GRAPHQL_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`GraphqlError`, `GraphqlErrorMapper`)
