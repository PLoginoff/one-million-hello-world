# Testing Strategy

## Overview
The Validation Layer follows a comprehensive testing strategy to ensure correctness, security, and performance of validation functionality. Tests are organized into unit tests, integration tests, and security tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IValidator Interface**: 100% (type validation)
- **Validator Implementation**: 99%+
- **Schema Validation**: 99%+
- **Field Validators**: 99%+
- **Sanitizers**: 99%+
- **Error Handler**: 99%+
- **Cross-Field Validator**: 99%+
- **Conditional Validator**: 99%+

## Unit Tests

### Test Organization
```
src/layers/validation/__tests__/
├── unit/
│   ├── validators/
│   │   ├── string-validator.test.ts
│   │   ├── number-validator.test.ts
│   │   ├── email-validator.test.ts
│   │   ├── url-validator.test.ts
│   │   ├── uuid-validator.test.ts
│   │   ├── phone-validator.test.ts
│   │   ├── credit-card-validator.test.ts
│   │   ├── ip-address-validator.test.ts
│   │   ├── hex-color-validator.test.ts
│   │   ├── base64-validator.test.ts
│   │   ├── json-validator.test.ts
│   │   └── xml-validator.test.ts
│   ├── sanitizers/
│   │   ├── trim-sanitizer.test.ts
│   │   ├── escape-html-sanitizer.test.ts
│   │   ├── xss-sanitizer.test.ts
│   │   ├── sql-injection-sanitizer.test.ts
│   │   └── strip-tags-sanitizer.test.ts
│   ├── cross-field/
│   │   ├── cross-field-validator.test.ts
│   │   └── cross-field-rules.test.ts
│   ├── conditional/
│   │   ├── conditional-validator.test.ts
│   │   └── conditional-schemas.test.ts
│   ├── error-handling/
│   │   ├── error-builder.test.ts
│   │   ├── error-formatter.test.ts
│   │   └── error-localization.test.ts
│   └── validator.test.ts
```

### Unit Test Categories

#### 1. String Validator Tests
```typescript
describe('String Validator', () => {
  it('should validate string length within range', () => {
    const rules: StringValidationRule[] = [
      { type: ValidationRuleType.MIN_LENGTH, value: 5 },
      { type: ValidationRuleType.MAX_LENGTH, value: 20 }
    ];
    
    const result = stringValidator.validate('hello world', rules);
    expect(result.valid).toBe(true);
  });

  it('should reject string too short', () => {
    const rules: StringValidationRule[] = [
      { type: ValidationRuleType.MIN_LENGTH, value: 10 }
    ];
    
    const result = stringValidator.validate('short', rules);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.STRING_TOO_SHORT);
  });

  it('should reject string too long', () => {
    const rules: StringValidationRule[] = [
      { type: ValidationRuleType.MAX_LENGTH, value: 10 }
    ];
    
    const result = stringValidator.validate('this string is too long', rules);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.STRING_TOO_LONG);
  });

  it('should validate pattern matching', () => {
    const rules: StringValidationRule[] = [
      { type: ValidationRuleType.PATTERN, value: '^[a-z]+$' }
    ];
    
    const result = stringValidator.validate('hello', rules);
    expect(result.valid).toBe(true);
  });

  it('should reject pattern mismatch', () => {
    const rules: StringValidationRule[] = [
      { type: ValidationRuleType.PATTERN, value: '^[a-z]+$' }
    ];
    
    const result = stringValidator.validate('Hello123', rules);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.PATTERN_MISMATCH);
  });
});
```

#### 2. Email Validator Tests
```typescript
describe('Email Validator', () => {
  it('should validate valid email', () => {
    const result = emailValidator.validate('test@example.com');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid email format', () => {
    const result = emailValidator.validate('invalid-email');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.INVALID_EMAIL);
  });

  it('should reject email without @', () => {
    const result = emailValidator.validate('testexample.com');
    expect(result.valid).toBe(false);
  });

  it('should reject email with local part too long', () => {
    const longLocal = 'a'.repeat(65) + '@example.com';
    const result = emailValidator.validate(longLocal);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.EMAIL_LOCAL_TOO_LONG);
  });

  it('should reject email with domain too long', () => {
    const longDomain = 'test@' + 'a'.repeat(256);
    const result = emailValidator.validate(longDomain);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.EMAIL_DOMAIN_TOO_LONG);
  });
});
```

#### 3. URL Validator Tests
```typescript
describe('URL Validator', () => {
  it('should validate valid HTTP URL', () => {
    const result = urlValidator.validate('https://example.com/path');
    expect(result.valid).toBe(true);
  });

  it('should validate valid FTP URL', () => {
    const result = urlValidator.validate('ftp://ftp.example.com');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid URL format', () => {
    const result = urlValidator.validate('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.INVALID_URL);
  });

  it('should reject invalid protocol', () => {
    const result = urlValidator.validate('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(ValidationError.INVALID_URL_PROTOCOL);
  });
});
```

#### 4. Sanitizer Tests
```typescript
describe('Sanitizers', () => {
  describe('Trim Sanitizer', () => {
    it('should trim whitespace', () => {
      const result = trimSanitizer.sanitize('  hello  ');
      expect(result).toBe('hello');
    });
  });

  describe('Escape HTML Sanitizer', () => {
    it('should escape HTML entities', () => {
      const result = escapeHTMLSanitizer.sanitize('<script>alert(1)</script>');
      expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });

  describe('XSS Sanitizer', () => {
    it('should remove script tags', () => {
      const result = xssSanitizer.sanitize('<script>alert(1)</script>');
      expect(result).not.toContain('<script>');
    });

    it('should remove javascript: protocol', () => {
      const result = xssSanitizer.sanitize('javascript:alert(1)');
      expect(result).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const result = xssSanitizer.sanitize('<img onerror="alert(1)">');
      expect(result).not.toContain('onerror');
    });
  });

  describe('SQL Injection Sanitizer', () => {
    it('should remove SQL injection patterns', () => {
      const result = sqlInjectionSanitizer.sanitize("' OR '1'='1");
      expect(result).not.toContain("'");
    });

    it('should remove SQL keywords', () => {
      const result = sqlInjectionSanitizer.sanitize('SELECT * FROM users');
      expect(result).not.toContain('SELECT');
    });
  });
});
```

#### 5. Cross-Field Validator Tests
```typescript
describe('Cross-Field Validator', () => {
  it('should validate password confirmation', async () => {
    const data = new Map([
      ['password', 'secret123'],
      ['passwordConfirmation', 'secret123']
    ]);
    
    const result = await crossFieldValidator.validate(data, context);
    expect(result.valid).toBe(true);
  });

  it('should reject mismatched password confirmation', async () => {
    const data = new Map([
      ['password', 'secret123'],
      ['passwordConfirmation', 'different']
    ]);
    
    const result = await crossFieldValidator.validate(data, context);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('does not match');
  });

  it('should validate date range', async () => {
    const data = new Map([
      ['startDate', '2024-01-01'],
      ['endDate', '2024-12-31']
    ]);
    
    const result = await crossFieldValidator.validate(data, context);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid date range', async () => {
    const data = new Map([
      ['startDate', '2024-12-31'],
      ['endDate', '2024-01-01']
    ]);
    
    const result = await crossFieldValidator.validate(data, context);
    expect(result.valid).toBe(false);
  });
});
```

#### 6. Error Handler Tests
```typescript
describe('Error Handlers', () => {
  describe('Strict Error Handler', () => {
    it('should throw on validation failure', () => {
      const result = {
        valid: false,
        errors: [{ code: ValidationError.REQUIRED_FIELD_MISSING }],
        warnings: [],
        metadata: {}
      };
      
      expect(() => strictErrorHandler.handle(result)).toThrow(ValidationErrorException);
    });

    it('should not throw on valid result', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
        metadata: {}
      };
      
      expect(() => strictErrorHandler.handle(result)).not.toThrow();
    });
  });

  describe('Lenient Error Handler', () => {
    it('should return result even if invalid', () => {
      const result = {
        valid: false,
        errors: [{ code: ValidationError.REQUIRED_FIELD_MISSING }],
        warnings: [],
        metadata: {}
      };
      
      const handled = lenientErrorHandler.handle(result);
      expect(handled).toBe(result);
    });
  });
});
```

## Integration Tests

### Full Validation Pipeline Tests
```typescript
describe('Validation Pipeline Integration', () => {
  it('should validate complete request', async () => {
    const schema: ValidationSchema = {
      fields: [
        {
          name: 'email',
          type: FieldType.EMAIL,
          required: true
        },
        {
          name: 'password',
          type: FieldType.STRING,
          validation: [
            { type: ValidationRuleType.MIN_LENGTH, value: 8 }
          ]
        }
      ]
    };
    
    const data = new Map([
      ['email', 'test@example.com'],
      ['password', 'secret123']
    ]);
    
    const result = await validator.validate(data, schema);
    expect(result.valid).toBe(true);
  });

  it('should fail validation with missing required field', async () => {
    const schema: ValidationSchema = {
      fields: [
        {
          name: 'email',
          type: FieldType.EMAIL,
          required: true
        }
      ]
    };
    
    const data = new Map();
    
    const result = await validator.validate(data, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === ValidationError.REQUIRED_FIELD_MISSING)).toBe(true);
  });

  it('should apply sanitization before validation', async () => {
    const schema: ValidationSchema = {
      fields: [
        {
          name: 'name',
          type: FieldType.STRING,
          sanitization: [
            { name: 'trim' },
            { name: 'lowercase' }
          ]
        }
      ]
    };
    
    const data = new Map([['name', '  HELLO  ']]);
    
    const result = await validator.validate(data, schema);
    expect(result.sanitizedData?.get('name')).toBe('hello');
  });
});
```

## Security Tests

### XSS Prevention Tests
```typescript
describe('XSS Prevention', () => {
  it('should prevent XSS via script tags', async () => {
    const data = new Map([
      ['comment', '<script>alert(document.cookie)</script>']
    ]);
    
    const result = await validator.validate(data, schema);
    const sanitized = result.sanitizedData?.get('comment');
    
    expect(sanitized).not.toContain('<script>');
  });

  it('should prevent XSS via event handlers', async () => {
    const data = new Map([
      ['content', '<img onerror="alert(1)" src="x">']
    ]);
    
    const result = await validator.validate(data, schema);
    const sanitized = result.sanitizedData?.get('content');
    
    expect(sanitized).not.toContain('onerror');
  });

  it('should prevent XSS via javascript: protocol', async () => {
    const data = new Map([
      ['url', 'javascript:alert(1)']
    ]);
    
    const result = await validator.validate(data, schema);
    const sanitized = result.sanitizedData?.get('url');
    
    expect(sanitized).not.toContain('javascript:');
  });
});
```

### SQL Injection Prevention Tests
```typescript
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection via OR clause', async () => {
    const data = new Map([
      ['query', "' OR '1'='1"]
    ]);
    
    const result = await validator.validate(data, schema);
    const sanitized = result.sanitizedData?.get('query');
    
    expect(sanitized).not.toContain("'");
  });

  it('should prevent SQL injection via UNION', async () => {
    const data = new Map([
      ['query', 'UNION SELECT * FROM users']
    ]);
    
    const result = await validator.validate(data, schema);
    const sanitized = result.sanitizedData?.get('query');
    
    expect(sanitized).not.toContain('UNION');
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should validate simple schema within time limit', async () => {
    const schema = createSimpleSchema();
    const data = createValidData();
    
    const start = Date.now();
    await validator.validate(data, schema);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10); // < 10ms
  });

  it('should validate complex schema within time limit', async () => {
    const schema = createComplexSchema();
    const data = createValidData();
    
    const start = Date.now();
    await validator.validate(data, schema);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50); // < 50ms
  });

  it('should handle large datasets efficiently', async () => {
    const schema = createSimpleSchema();
    const data = createLargeData(1000);
    
    const start = Date.now();
    await validator.validate(data, schema);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(1000); // < 1s for 1000 fields
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createSimpleSchema(): ValidationSchema {
  return {
    fields: [
      {
        name: 'email',
        type: FieldType.EMAIL,
        required: true
      },
      {
        name: 'name',
        type: FieldType.STRING,
        validation: [
          { type: ValidationRuleType.MIN_LENGTH, value: 2 },
          { type: ValidationRuleType.MAX_LENGTH, value: 100 }
        ]
      }
    ]
  };
}

function createValidData(): Map<string, any> {
  return new Map([
    ['email', 'test@example.com'],
    ['name', 'Test User']
  ]);
}

function createLargeData(fieldCount: number): Map<string, any> {
  const data = new Map<string, any>();
  
  for (let i = 0; i < fieldCount; i++) {
    data.set(`field${i}`, `value${i}`);
  }
  
  return data;
}

function createValidationContext(): ValidationContext {
  return {
    fieldName: 'test',
    fieldType: FieldType.STRING,
    metadata: new Map(),
    requestMetadata: {
      requestId: 'test-request',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      timestamp: new Date()
    }
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/validation
```

### Integration Tests
```bash
npm run test:integration -- src/layers/validation
```

### Security Tests
```bash
npm run test:security -- src/layers/validation
```

### Performance Tests
```bash
npm run test:performance -- src/layers/validation
```

### All Tests
```bash
npm test -- src/layers/validation
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/validation
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Validation Tests

on:
  pull_request:
    paths:
      - 'src/layers/validation/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/validation
      - run: npm run test:integration -- src/layers/validation
      - run: npm run test:security -- src/layers/validation
      - run: npm run test:performance -- src/layers/validation
      - run: npm run test:coverage -- src/layers/validation
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all validation rules
- Test edge cases and boundary conditions
- Test sanitization with malicious input
- Test error handling scenarios
- Test cross-field validation
- Test conditional validation
- Test custom validators
- Maintain test independence

### Security Testing Guidelines
- Test with XSS payloads
- Test with SQL injection payloads
- Test with malicious file uploads
- Test with encoded attacks
- Test with bypass techniques
- Test sanitization effectiveness

### Performance Testing Guidelines
- Test with realistic data sizes
- Test with complex schemas
- Test with nested objects
- Test with large arrays
- Monitor memory usage
- Test concurrent validation
