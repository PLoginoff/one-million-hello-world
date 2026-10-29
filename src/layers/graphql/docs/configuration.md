# Configuration: GraphQL Layer

## Layer defaults
`DEFAULT_GRAPHQL_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>`; `GraphqlConfigurationBuilder` and validator provide typed construction.

## Building a schema
Two entry points:

```ts
// SDL
const typeDefs = SchemaParser.parse(`
  type Query { hello(name: String): String }
`);

// Programmatic — fields carry resolvers
const schema = new Schema({ query: QueryType /* ObjectTypeDef with resolvers */ });
```

Resolvers are plain `(parent, args, context) => value | Promise<value>` functions attached to `FieldDef`s.

## Executing
`GraphQLHandler.handle({ query, variables, operationName })` runs parse → validate → execute and returns `{ status, body }`. Introspection queries (`__schema`, `__type`) are handled automatically.

## Supported spec surface
Queries, mutations, fragments (named + inline), variables with defaults and input coercion, `@skip`/`@include`, aliases, lists, NonNull propagation, introspection. **Not supported:** subscriptions, custom directives, `@defer`/`@stream`.

## Status inspection
`getStatus()` → `{ config, metrics, active }` with `successCount`/`failureCount`/`lastExecutionTime`.
