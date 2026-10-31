# Sanitization

## Overview
Sanitization runs on `Validator` (`IValidator`): `sanitize(request)` for a whole request, `sanitizeField(field, value, sanitizers)` / `applySanitizers(value, sanitizers)` for single values. Sanitizers are declarative `{ name, type, options }` entries (see `types/validation-types.ts`), not classes — there is no `SanitizationPipeline`/`TrimSanitizer`/etc.

## Sanitizer Definition

```typescript
interface Sanitizer {
  name: string;
  type: SanitizerType | string;   // use 'CUSTOM' + fn for bespoke
  options?: SanitizerOptions;     // preserveSpaces, allowedTags, allowedAttributes, encoding
}
```

## `SanitizerType`

- **Casing/whitespace**: `TRIM`, `LOWERCASE`, `UPPERCASE`, `CAPITALIZE`, `NORMALIZE_WHITESPACE`
- **HTML/XSS**: `ESCAPE_HTML`, `STRIP_TAGS`, `REMOVE_SCRIPTS`, `REMOVE_STYLES`, `REMOVE_COMMENTS`
- **Encoding**: `ENCODE_URI`, `DECODE_URI`, `ESCAPE_REGEX`, `REMOVE_NULL_BYTES`
- **Custom**: `CUSTOM` — pair with a `customValidator`-style function or a named type string

`SanitizerOptions`: `preserveSpaces`, `allowedTags`, `allowedAttributes`, `encoding`.

## Applying Sanitizers

```typescript
const out = validator.applySanitizers(dirty, [
  { name: 'trim', type: SanitizerType.TRIM },
  { name: 'xss', type: SanitizerType.STRIP_TAGS },
]);

const field = validator.sanitizeField('bio', userInput, [
  { name: 'ws', type: SanitizerType.NORMALIZE_WHITESPACE },
  { name: 'strip', type: SanitizerType.STRIP_TAGS,
    options: { allowedTags: ['b', 'i'], allowedAttributes: [] } },
]);
```

`sanitize(request)` returns `SanitizationResult`:

```typescript
interface SanitizationResult {
  sanitized: unknown;
  changed: boolean;
  removedFields: string[];
  modifiedFields: { field, originalValue, sanitizedValue, sanitizer }[];
  sanitizationMetrics: { fieldsSanitized, fieldsRemoved, fieldsModified, sanitizationDuration };
}
```

## Wiring into Schemas

Attach `sanitizers` on a `FieldValidation` and set `schema.sanitize = true` — sanitization runs before validation so length/pattern checks see clean input. `validateExtended` returns `sanitizedData` alongside the result.

```typescript
const schema: ValidationSchema = {
  sanitize: true,
  fields: {
    bio: { required: true, type: FieldType.STRING, maxLength: 500,
           sanitizers: [
             { name: 'ws', type: SanitizerType.NORMALIZE_WHITESPACE },
             { name: 'strip', type: SanitizerType.STRIP_TAGS },
           ]},
  },
};
```

## Field Removal

Mark fields for removal by giving them a sanitizer that returns `null`/`undefined` (or drop them with `removedFields`). Use for sensitive fields (`password`, `creditCard`, `ssn`, `apiKey`, `secret`) — removed fields land in `result.removedFields`.

## Best Practices

- Sanitize before validation (`schema.sanitize` or `sanitizeField` first).
- Prefer `STRIP_TAGS`/`REMOVE_SCRIPTS`/`ESCAPE_HTML` for untrusted HTML over broad regexes.
- Keep `allowedTags`/`allowedAttributes` whitelists minimal.
- Don't sanitize secrets into logs — `modifiedFields` records `originalValue`, so redact before persisting results.
