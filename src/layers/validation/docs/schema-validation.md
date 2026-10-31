# Schema Validation

## Overview
Schema validation runs through `Validator` (`IValidator`). A `ValidationSchema` declares per-field `FieldValidation` rules plus optional `crossFieldRules`, `conditionalRules`, and nested schemas. Types live in `types/validation-types.ts`.

## Schema Definition

```typescript
interface ValidationSchema {
  fields: Record<string, FieldValidation>;
  strictMode?: boolean;
  sanitize?: boolean;
  version?: string;
  nestedSchemas?: Record<string, ValidationSchema>;
  crossFieldRules?: CrossFieldRule[];
  conditionalRules?: ConditionalRule[];
}

enum FieldType {
  STRING, NUMBER, BOOLEAN, DATE, ARRAY, OBJECT,
  UUID, PHONE, EMAIL, URL, CREDIT_CARD,
  IP_ADDRESS, HEX_COLOR, BASE64, JSON, XML, ANY,
}
```

## Field Rules (`FieldValidation`)

```typescript
interface FieldValidation {
  required: boolean;
  type: FieldType;
  minLength?: number; maxLength?: number;       // string/array length
  pattern?: RegExp;
  enum?: unknown[];
  min?: number; max?: number;                   // numeric range
  email?: boolean; url?: boolean; date?: boolean;
  uuid?: boolean; phone?: boolean; creditCard?: boolean;
  ipAddress?: boolean; hexColor?: boolean; base64?: boolean;
  json?: boolean; xml?: boolean;
  booleanString?: boolean; numberString?: boolean;
  allowNull?: boolean; allowUndefined?: boolean;
  arrayMinLength?: number; arrayMaxLength?: number;
  objectRequiredKeys?: string[]; objectAllowedKeys?: string[];
  nestedSchema?: ValidationSchema;
  customValidator?: (v, ctx) => boolean;
  asyncValidator?: (v, ctx) => Promise<boolean>;
  sanitizers?: Sanitizer[];
}
```

Set boolean flags to enforce a format (`email: true`, `uuid: true`, `ipAddress: true`, …) or use the matching `FieldType`. Length/range constraints apply after the type/format check.

## Running Validation

```typescript
const result = validator.validate(request, schema);           // ValidationResult
const ext = validator.validateExtended(request, schema, ctx); // + sanitizedData, validationTime, schemaVersion

result.valid;            // no errors (warnings don't affect it)
result.errors;           // ValidationError[] { field, code, message, severity, path, nestedErrors }
result.warnings;         // ValidationWarning[]
result.metrics;          // fieldsChecked/Passed/Failed/Skipped, durations, memoryUsage
```

`strictMode: true` fails on undeclared fields. `sanitize: true` runs field `sanitizers` before validation.

## Built-in Format Checks

```typescript
validator.isValidUUID(v);   validator.isValidPhone(v);
validator.isValidCreditCard(v); validator.isValidIPAddress(v);
validator.isValidHexColor(v);   validator.isValidBase64(v);
validator.isValidJSON(v);       validator.isValidXML(v);
```

## Nested Schemas

```typescript
validator.validateNestedSchema(data, schema, 'user.address', ctx);
```

Or set `field.nestedSchema` / `schema.nestedSchemas` — nested failures surface as `nestedErrors` with dotted `path`.

## Cross-Field and Conditional Rules

```typescript
interface CrossFieldRule {
  id, name, fields: string[],
  validator: (values, ctx) => boolean,
  errorMessage: string, enabled: boolean,
}

interface ConditionalRule {
  id, name,
  condition: (data, ctx) => boolean,
  then: ValidationSchema, otherwise?: ValidationSchema, enabled,
}
```

```typescript
validator.validateCrossFieldRules(data, rules, ctx);
validator.validateConditionalRules(data, rules, ctx);
validator.addCrossFieldRule(rule);   validator.removeCrossFieldRule(id);
validator.addConditionalRule(rule);  validator.removeConditionalRule(id);
```

Cross-field example: `password === confirmPassword`, `endDate > startDate`. Conditional example: apply `then` schema only when `condition` holds (e.g. `type === 'business' → require taxId`).

## Custom Validators

```typescript
validator.addCustomValidator('sku-format', (v, ctx) => /^SKU-\d{6}$/.test(String(v)));
validator.removeCustomValidator('sku-format');
```

`customValidator`/`asyncValidator` on `FieldValidation` run per field; failures produce `CUSTOM`/`ASYNC_VALIDATION` errors.

## Schema Management

```typescript
validator.setDefaultSchema(schema);
validator.getDefaultSchema();
validator.setValidationConfig(config);
validator.getValidationConfig();
validator.createValidationContext(request);  // { requestId, timestamp, userId, ipAddress, userAgent, correlationId }
```

## Best Practices

- One schema per request shape; version it (`schema.version`) and reuse via `setDefaultSchema`.
- Prefer declarative flags (`email`, `uuid`, `enum`) over `customValidator` — they produce precise `ValidationErrorCode`s.
- Use `crossFieldRules` for multi-field invariants and `conditionalRules` for type-dependent fields.
- Keep `strictMode` on for public APIs to reject unexpected input.
