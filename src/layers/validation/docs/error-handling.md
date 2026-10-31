# Error Handling

## Overview
Validation failures surface as `ValidationError[]`/`ValidationWarning[]` on `ValidationResult` — the `Validator` never throws for bad input. Types live in `types/validation-types.ts`; layer errors are mapped by `utils/ValidationErrorMapper` / `ValidationError`.

## Error Types

### `ValidationErrorCode`
`REQUIRED`, `INVALID_TYPE`, `INVALID_FORMAT`, `INVALID_LENGTH`, `INVALID_RANGE`, `INVALID_PATTERN`, `INVALID_ENUM`, `INVALID_EMAIL`, `INVALID_URL`, `INVALID_DATE`, `INVALID_UUID`, `INVALID_PHONE`, `INVALID_CREDIT_CARD`, `INVALID_IP_ADDRESS`, `INVALID_HEX_COLOR`, `INVALID_BASE64`, `INVALID_JSON`, `INVALID_XML`, `INVALID_BOOLEAN_STRING`, `INVALID_NUMBER_STRING`, `INVALID_NULL_VALUE`, `INVALID_UNDEFINED_VALUE`, `INVALID_ARRAY_LENGTH`, `INVALID_OBJECT_KEYS`, `INVALID_NESTED_SCHEMA`, `CROSS_FIELD_VALIDATION`, `CONDITIONAL_VALIDATION`, `ASYNC_VALIDATION`, `CUSTOM`.

### `ValidationWarningCode`
`DEPRECATED`, `FUTURE_VALUE`, `PAST_VALUE`, `UNUSUAL_VALUE`, `WEAK_PASSWORD`, `DUPLICATE_VALUE`, `SENSITIVE_DATA`, `LARGE_PAYLOAD`, `MISSING_OPTIONAL_FIELD`, `TYPE_COERCION`.

### `ValidationSeverity`
`ERROR` | `WARNING` | `INFO` — carried by both errors and warnings. `result.valid` is `false` only when `errors` is non-empty; warnings never block.

## Result Shape

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];     // { field, code, message, value?, severity, path?, nestedErrors? }
  warnings: ValidationWarning[]; // { field, code, message, value?, severity, path? }
  metrics: ValidationMetrics;    // fieldsChecked/Passed/Failed/Skipped, validationDuration, sanitizationDuration, totalDuration, memoryUsage
}

interface ExtendedValidationResult extends ValidationResult {
  sanitizedData: unknown;
  validationTime: number;
  schemaVersion: string;
  validationContext: ValidationContext;  // requestId, timestamp, userId, sessionId, ipAddress, userAgent, correlationId
}
```

- `error.field` — top-level field name; `error.path` — dotted path into nested objects.
- `error.nestedErrors` — child errors from `nestedSchema`/`validateNestedSchema`.
- `error.value` — the offending input (redact before logging user-sensitive data).

## Getting Messages

```typescript
validator.getErrorMessage(ValidationErrorCode.INVALID_EMAIL, 'email');
validator.getWarningMessage(ValidationWarningCode.WEAK_PASSWORD, 'password');
```

## Handling Modes

- **Strict**: treat `!result.valid` as a 400 — map `result.errors` to the response body.
- **Lenient**: continue on warnings; only errors reject.
- **Collect-all**: validate every field (default) and return the full `errors` array so callers can show all problems at once.
- **Fail-fast**: stop on first error by iterating `schema.fields` with `validateField` and returning on the first `false`.

```typescript
const result = validator.validate(request, schema);
if (!result.valid) {
  return reply.status(400).json({
    errors: result.errors.map(e => ({ field: e.field, code: e.code, message: e.message })),
  });
}
```

## Statistics and Diagnostics

```typescript
validator.getStatistics();   // ValidationStatistics: totals, error/warning counts, avg time
validator.resetStatistics();
validator.getHealthStatus(); // 'healthy' | 'degraded' | 'unhealthy' + checks
validator.runDiagnostics();  // ValidationDiagnostics: steps + summary
```

## Recovery

For auto-correction, apply field `sanitizers` first (`schema.sanitize` or `validator.sanitize`/`sanitizeField`) — most `INVALID_FORMAT`/`INVALID_LENGTH` failures disappear once input is normalized. Manual review is still required for `SENSITIVE_DATA`, `INVALID_CREDIT_CARD`, and security-adjacent warnings.

## Best Practices

- Use `code` (stable enum) for programmatic handling and `message` for display.
- Include `field`/`path` in API responses; keep `value` out of logs when it may contain secrets.
- Prefer declarative rules over `customValidator` — they emit precise codes.
- Track `metrics`/`getStatistics()` to find hot or failing fields.
