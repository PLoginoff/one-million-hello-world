# Configuration: Serialization Layer

## `SerializationConfig` (`types/serialization-types.ts`)

| Option | Type | Description |
|--------|------|-------------|
| `defaultFormat` | `SerializationFormat` | Format used when the request doesn't specify one |
| `enableVersioning` | boolean | Apply a versioning strategy to output |
| `currentVersion` | string | Version string stamped into output |
| `enableValidation` | boolean | Run the validation pipeline on serialize/deserialize |
| `enablePlugins` | boolean | Run registered plugins |
| `enableHooks` | boolean | Run registered hooks |
| `strictMode` | boolean | Fail on warnings/unknowns where supported |
| `maxDataSize` | number? | Reject payloads above this size |
| `timeout` | number? | Abort operations exceeding this ms |

## `SerializationOptions` (per-call overrides)
`format?`, `validate?`, `skipPlugins?`, `skipHooks?`, `metadata?`.

## Config subsystem (`config/`)
- `ConfigLoader` — loads config from `ConfigSource`s.
- `ConfigSchema` / `ConfigValidator` — schema-driven validation with
  `defaultSerializationConfigSchema`; produces typed defaults.
- `SerializerBuilder` (`builders/`) — fluent serializer construction.

## Related docs
- `serialization-formats.md` — per-format behavior.
- `content-negotiation.md` — Accept negotiation and fallbacks.
- `versioning.md` — wrapper/header/custom strategies.
- `error-handling.md` — `SerializationError`, codes, context.
