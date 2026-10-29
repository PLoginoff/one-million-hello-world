# Response Generation

Responses are `ControllerResult` objects produced by two methods on
`implementations/Controller.ts` — there is no `ResponseBuilder`,
`HeaderManager` or `JSONFormatter` class.

## Shapes (`types/controller-types.ts`)

```ts
interface ResponseData {
  statusCode: HttpStatusCode;
  headers: Map<string, string>;
  body: Buffer;
}

interface ControllerResult {
  success: boolean;
  response?: ResponseData;
  error?: ControllerError;
}

interface ControllerError {
  code: HttpStatusCode;
  message: string;
  details?: Record<string, unknown>;
}
```

`HttpStatusCode` is an enum: `200, 201, 202, 204, 400, 401, 403, 404,
405, 409, 500, 501, 503`.

## Success responses

```ts
controller.createSuccessResponse(body: string, statusCode = 200);
```

- `body` is serialized to `Buffer.from(body)` (caller passes a
  JSON string — the method does not `JSON.stringify`).
- Headers are a fixed two-entry map: `content-type: application/json`,
  `content-length: body.length`.
- Returns `{ success: true, response }` — no `error` field.

## Error responses

```ts
controller.createErrorResponse(message, statusCode = 500, details?);
```

- Builds `ControllerError { code, message, details }`.
- Serializes `{ error }` to JSON via `JSON.stringify`, then to a
  `Buffer`.
- Same two headers; returns `{ success: false, response, error }` —
  both fields populated so callers can inspect the structured error and
  the wire representation.

## Header generation

Headers are generated inline — always `content-type: application/json`
and `content-length`. There is no CORS, cache-control or pagination
support in the implementation; add it by post-processing
`response.headers` or extending `createSuccessResponse`.
