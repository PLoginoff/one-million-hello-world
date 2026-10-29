# Configuration: Validation Layer

## `ValidationConfig` (`types/validation-types.ts`)

| Option | Type | Description |
|--------|------|-------------|
| `strictMode` | boolean | Reject unknown fields / warnings-as-errors |
| `sanitize` | boolean | Run the sanitization pipeline during validation |
| `enableAsyncValidation` | boolean | Allow async validators |
| `enableCrossFieldValidation` | boolean | Enable rules spanning multiple fields |
| `enableConditionalValidation` | boolean | Enable condition-gated rules |
| `maxValidationTime` | number | Abort validation after this many ms |
| `enableDiagnostics` | boolean | Collect `ValidationDiagnostics` |
| `enableHealthChecks` | boolean | Expose `ValidationHealthCheck` |
| `enableStatistics` | boolean | Collect `ValidationMetrics`/`ValidationStatistics` |

## `ValidationConfigOptions` presets
`configuration/defaults/DefaultConfigs.ts`:

| Preset | strict | stopOnFirstError | returnAllErrors | autoTrim | typeCoercion | maxDepth | maxErrors |
|--------|--------|------------------|-----------------|----------|--------------|----------|-----------|
| `DEFAULT` | false | false | true | true | false | 10 | 100 |
| `STRICT` | true | false | true | false | false | 5 | 50 |
| `LENIENT` | false | true | false | true | true | 20 | 10 |
| `API` | true | false | true | true | false | 10 | 100 |

`DefaultConfigs.custom(partial)` merges overrides onto `DEFAULT`.

## Layer constants
`configuration/defaults/ValidationDefaults.ts` —
`ValidationDEFAULTS`, `ValidationLIMITS`, `ValidationSTRATEGIES`
(`'default'`, `'fast'`, `'reliable'`, `'cached'`, `'batch'`).

## Builders and validators
- `ValidationConfigBuilder` / `ValidationConfigurationBuilder`
  (`configuration/builders/`).
- `ValidationConfigValidator` / `ValidationConfigurationValidator`
  (`configuration/validators/`).

## Related docs
- `schema-validation.md`, `sanitization.md`, `error-handling.md`.
