# Error Handling

Errors are handled in two places: inline inside
`implementations/Controller.ts` and via `utils/ControllerError.ts` /
`utils/ControllerErrorMapper.ts`. There is no `ErrorMiddleware` or
per-type error classes beyond `ControllerError`.

## In-handler catch (`Controller.handle`)

```ts
try {
  return await handler(context);
} catch (error) {
  return this.createErrorResponse(
    error instanceof Error ? error.message : 'Unknown error',
    HttpStatusCode.INTERNAL_SERVER_ERROR
  );
}
```

Any exception inside a handler becomes a `500` `ControllerResult`; the
controller never rethrows.

## `ControllerError` (`utils/ControllerError.ts`)

A single `Error` subclass carrying a machine `code` and optional
`controllerId`:

- `ControllerError.notFound()` → `CONTROLLER_NOT_FOUND`.
- `ControllerError.alreadyRegistered()` →
  `CONTROLLER_ALREADY_REGISTERED`.
- `ControllerError.instantiationFailed()` →
  `CONTROLLER_INSTANTIATION_FAILED`.
- `toJSON()` serializes `name`, `code`, `message`, `controllerId`,
  `stack` for logging/transport.

(Note: this `utils/ControllerError` is an `Error` subclass and is
distinct from the `ControllerError` *interface* in
`types/controller-types.ts` used inside `ControllerResult`.)

## `ControllerErrorMapper` (`utils/ControllerErrorMapper.ts`)

Maps errors to HTTP-shaped `MappedError { statusCode, code, message,
details }` through a static table:

| Code | HTTP |
|------|------|
| `CONTROLLER_NOT_FOUND`               | 404 |
| `CONTROLLER_ALREADY_REGISTERED`      | 409 |
| `CONTROLLER_INSTANTIATION_FAILED`    | 500 |
| `CONTROLLER_DISABLED`                | 503 |
| `CONTROLLER_TIMEOUT`                 | 503 |
| `CONTROLLER_VALIDATION_FAILED`       | 400 |
| `CONTROLLER_UNAUTHORIZED`            | 401 |
| `CONTROLLER_FORBIDDEN`               | 403 |
| `CONTROLLER_METHOD_NOT_ALLOWED`      | 405 |

`map(error)` handles both `ControllerError` (table lookup, default
500) and plain `Error` (always 500 + `INTERNAL_ERROR`).
`toControllerResult(error)` converts the mapped error straight into a
`ControllerResult` for the wire.
