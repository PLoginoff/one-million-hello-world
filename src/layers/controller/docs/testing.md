# Testing: Controller Layer

## Test files

Top-level (`__tests__/`):

- `Controller.test.ts` — `handle`, `createContext`,
  `createSuccessResponse`, `createErrorResponse`, `registerHandler`/
  `getHandler` and id generation.
- `ControllerErrorMapper.test.ts` — `ControllerErrorMapper.map` /
  `toControllerResult` for each `CONTROLLER_*` code.
- `ControllerConfiguration.test.ts` — `ControllerDEFAULTS`, builders
  and validators; `DefaultConfigs` presets.
- `ControllerStrategies.test.ts` — `ICControllerStrategy`
  implementations and the strategy factory.
- `ControllerHealthCheck.test.ts` — `ControllerHealthCheck` status
  aggregation.
- `ControllerMetricsCollector.test.ts` — `ControllerMetricsCollector`
  counters/timings.
- `RouterControllerIntegration.test.ts` — `Router` (from
  `src/layers/router`) matches a request and the `Controller` handles
  the matched route end-to-end.

Domain (`domain/__tests__/`):

- `ControllerExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `ControllerServices.test.ts` — execution/query/validation services.
- `ControllerPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/controller/
```

## Conventions

- Handlers are async fns returning `ControllerResult` literals;
  `HttpRequest`s are built in-test with a `Map` of headers.
- No sockets or real HTTP — `RouterControllerIntegration.test.ts` stays
  in-process on the shared types.
- `ControllerError` codes map to `HttpStatusCode` via the table in
  `utils/ControllerErrorMapper.ts`; tests assert both the `MappedError`
  and the resulting `ControllerResult`.
