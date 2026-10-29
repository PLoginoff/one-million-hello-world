# Request Handling

Request handling lives in a single class — `implementations/Controller.ts`
(`Controller` implements `IController`). There is no separate
`HandlerRegistry`, `ContextBuilder` or `HandlerExecutor`; their
responsibilities are methods on `Controller`.

## Handler model

```ts
type HandlerFunction = (context: ControllerContext) => Promise<ControllerResult>;
```

`Controller` keeps handlers in a private `_handlers: Map<string,
HandlerFunction>`:

- `registerHandler(operation, handler)` — stores a handler under an
  operation name.
- `getHandler(operation)` — retrieves it (`undefined` when absent).

The registry is in-memory and dynamic — handlers are registered at
runtime, not declared in a static table.

## Executing a request

```ts
await controller.handle(request, handler, context);
```

`handle` calls `await handler(context)` and wraps the result:

- Any thrown error becomes `createErrorResponse(message,
  HttpStatusCode.INTERNAL_SERVER_ERROR)` — the controller never lets an
  exception escape.
- The returned `ControllerResult` is whatever the handler produced —
  `handle` does not rewrite it.

## Building the context

`createContext(request, parameters)` produces `ControllerContext`:

```ts
interface ControllerContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  parameters: Record<string, string>;
  headers: Map<string, string>;
}
```

- `requestId` — `x-request-id` header or a generated id.
- `correlationId` — `x-correlation-id` header or a generated id.
- `userId` — `x-user-id` header or `undefined`.
- `parameters` — caller-supplied route/path parameters.
- `headers` — a fresh `Map` copy of `request.headers`.

`_generateId()` is `Math.random().toString(36)` × 2 — good enough for
correlation, not a UUID.

## Strategies & handlers in `domain/`

`strategies/IControllerStrategy.ts` defines the pluggable execution
contract; `Default`/`Fast`/`Reliable`/`Cached`/`Batch` implementations
plus `Logging`/`Metrics` decorators vary how `handle` runs.
`domain/handlers/` carries CQRS-style `ControllerCommandHandler`,
`ControllerQueryHandler` and `ControllerEventHandler` for the domain
side.

`utils/ControllerHelpers.ts` adds path utilities
(`normalizeBasePath`, `removeTrailingSlash`, `addTrailingSlash`,
`validateControllerId`, …) used when wiring routes.
