# Error Handling

## Overview
The Validation Layer includes comprehensive error handling with detailed error codes, severity levels, and contextual information to help developers understand and resolve validation issues.

## Error Types

### Validation Error Codes
```typescript
enum ValidationError {
  // Type errors
  INVALID_TYPE = 'INVALID_TYPE',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  
  // String errors
  STRING_TOO_SHORT = 'STRING_TOO_SHORT',
  STRING_TOO_LONG = 'STRING_TOO_LONG',
  PATTERN_MISMATCH = 'PATTERN_MISMATCH',
  
  // Number errors
  NUMBER_TOO_SMALL = 'NUMBER_TOO_SMALL',
  NUMBER_TOO_LARGE = 'NUMBER_TOO_LARGE',
  NOT_INTEGER = 'NOT_INTEGER',
  
  // Format errors
  INVALID_EMAIL = 'INVALID_EMAIL',
  EMAIL_LOCAL_TOO_LONG = 'EMAIL_LOCAL_TOO_LONG',
  EMAIL_DOMAIN_TOO_LONG = 'EMAIL_DOMAIN_TOO_LONG',
  INVALID_URL = 'INVALID_URL',
  INVALID_URL_PROTOCOL = 'INVALID_URL_PROTOCOL',
  INVALID_UUID = 'INVALID_UUID',
  INVALID_PHONE = 'INVALID_PHONE',
  INVALID_PHONE_COUNTRY_CODE = 'INVALID_PHONE_COUNTRY_CODE',
  INVALID_CREDIT_CARD = 'INVALID_CREDIT_CARD',
  INVALID_CREDIT_CARD_CHECKSUM = 'INVALID_CREDIT_CARD_CHECKSUM',
  INVALID_IP_ADDRESS = 'INVALID_IP_ADDRESS',
  INVALID_HEX_COLOR = 'INVALID_HEX_COLOR',
  INVALID_BASE64 = 'INVALID_BASE64',
  INVALID_BASE64_PADDING = 'INVALID_BASE64_PADDING',
  INVALID_JSON = 'INVALID_JSON',
  INVALID_XML = 'INVALID_XML',
  INVALID_XML_NESTING = 'INVALID_XML_NESTING',
  
  // Required field errors
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  
  // Enum errors
  INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',
  
  // Cross-field errors
  CROSS_FIELD_VALIDATION_FAILED = 'CROSS_FIELD_VALIDATION_FAILED',
  
  // Custom errors
  UNKNOWN_VALIDATOR = 'UNKNOWN_VALIDATOR',
  CUSTOM_VALIDATION_FAILED = 'CUSTOM_VALIDATION_FAILED',
  
  // Sanitization errors
  SANITIZATION_FAILED = 'SANITIZATION_FAILED',
  MALICIOUS_CONTENT_DETECTED = 'MALICIOUS_CONTENT_DETECTED'
}
```

### Error Severity Levels
```typescript
enum ErrorSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}
```

## Validation Result

### Result Structure
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data?: Map<string, any>;
  sanitizedData?: Map<string, any>;
  metadata: ValidationMetadata;
}

interface ValidationError {
  code: ValidationError;
  field?: string;
  message: string;
  severity: ErrorSeverity;
  value?: any;
  context?: any;
}

interface ValidationWarning {
  code: ValidationWarningCode;
  field?: string;
  message: string;
  severity: ErrorSeverity;
  value?: any;
}

enum ValidationWarningCode {
  DEPRECATED_FIELD = 'DEPRECATED_FIELD',
  FIELD_RENAMED = 'FIELD_RENAMED',
  UNUSUAL_VALUE = 'UNUSUAL_VALUE',
  MISSING_RECOMMENDED_FIELD = 'MISSING_RECOMMENDED_FIELD',
  DATA_TRUNCATED = 'DATA_TRUNCATED',
  FORMAT_INCONSISTENT = 'FORMAT_INCONSISTENT',
  POTENTIAL_SECURITY_ISSUE = 'POTENTIAL_SECURITY_ISSUE',
  PERFORMANCE_CONCERN = 'PERFORMANCE_CONCERN',
  LEGACY_FORMAT = 'LEGACY_FORMAT',
  FUTURE_DEPRECATED = 'FUTURE_DEPRECATED'
}

interface ValidationMetadata {
  timestamp: Date;
  schemaVersion: string;
  validationDuration: number;
  sanitizationDuration: number;
  fieldsValidated: number;
  fieldsSanitized: number;
}
```

### Error Builder
```typescript
class ValidationErrorBuilder {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  
  addError(code: ValidationError, field?: string, message?: string, value?: any): void {
    this.errors.push({
      code,
      field,
      message: message || this.getDefaultMessage(code),
      severity: ErrorSeverity.ERROR,
      value
    });
  }
  
  addWarning(code: ValidationWarningCode, field?: string, message?: string, value?: any): void {
    this.warnings.push({
      code,
      field,
      message: message || this.getDefaultWarningMessage(code),
      severity: ErrorSeverity.WARNING,
      value
    });
  }
  
  build(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      metadata: {
        timestamp: new Date(),
        schemaVersion: this.schemaVersion,
        validationDuration: 0,
        sanitizationDuration: 0,
        fieldsValidated: 0,
        fieldsSanitized: 0
      }
    };
  }
  
  private getDefaultMessage(code: ValidationError): string {
    const messages: Map<ValidationError, string> = new Map([
      [ValidationError.INVALID_TYPE, 'Invalid data type'],
      [ValidationError.REQUIRED_FIELD_MISSING, 'Required field is missing'],
      [ValidationError.INVALID_EMAIL, 'Invalid email format'],
      [ValidationError.INVALID_URL, 'Invalid URL format'],
      [ValidationError.STRING_TOO_SHORT, 'String is too short'],
      [ValidationError.STRING_TOO_LONG, 'String is too long'],
      [ValidationError.NUMBER_TOO_SMALL, 'Number is too small'],
      [ValidationError.NUMBER_TOO_LARGE, 'Number is too large']
    ]);
    
    return messages.get(code) || 'Validation failed';
  }
  
  private getDefaultWarningMessage(code: ValidationWarningCode): string {
    const messages: Map<ValidationWarningCode, string> = new Map([
      [ValidationWarningCode.DEPRECATED_FIELD, 'Field is deprecated'],
      [ValidationWarningCode.UNUSUAL_VALUE, 'Unusual value detected'],
      [ValidationWarningCode.MISSING_RECOMMENDED_FIELD, 'Recommended field is missing']
    ]);
    
    return messages.get(code) || 'Warning';
  }
}
```

## Error Context

### Context Information
```typescript
interface ErrorContext {
  fieldName: string;
  fieldType: FieldType;
  schemaName: string;
  validationPath: string[];
  requestMetadata: RequestMetadata;
  stackTrace?: string;
}

class ErrorContextBuilder {
  build(field: FieldDefinition, schema: ValidationSchema, request: HttpRequest): ErrorContext {
    return {
      fieldName: field.name,
      fieldType: field.type,
      schemaName: schema.name || 'default',
      validationPath: [field.name],
      requestMetadata: {
        requestId: request.metadata.get('requestId') || generateId(),
        userId: request.securityContext?.userId,
        ipAddress: request.remoteAddress,
        userAgent: request.headers.get('user-agent') || '',
        timestamp: new Date()
      }
    };
  }
}
```

## Error Reporting

### Error Formatter
```typescript
interface ErrorFormatter {
  format(result: ValidationResult): string;
  formatJSON(result: ValidationResult): string;
  formatXML(result: ValidationResult): string;
}

class DefaultErrorFormatter implements ErrorFormatter {
  format(result: ValidationResult): string {
    const lines: string[] = [];
    
    if (!result.valid) {
      lines.push('Validation failed:');
      
      for (const error of result.errors) {
        const field = error.field ? `Field '${error.field}': ` : '';
        lines.push(`  - ${field}${error.message} (${error.code})`);
      }
    }
    
    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      
      for (const warning of result.warnings) {
        const field = warning.field ? `Field '${warning.field}': ` : '';
        lines.push(`  - ${field}${warning.message} (${warning.code})`);
      }
    }
    
    return lines.join('\n');
  }
  
  formatJSON(result: ValidationResult): string {
    return JSON.stringify(result, null, 2);
  }
  
  formatXML(result: ValidationResult): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<validationResult>\n';
    xml += `  <valid>${result.valid}</valid>\n`;
    
    if (result.errors.length > 0) {
      xml += '  <errors>\n';
      for (const error of result.errors) {
        xml += '    <error>\n';
        xml += `      <code>${error.code}</code>\n`;
        if (error.field) xml += `      <field>${error.field}</field>\n`;
        xml += `      <message>${this.escapeXML(error.message)}</message>\n`;
        xml += '    </error>\n';
      }
      xml += '  </errors>\n';
    }
    
    if (result.warnings.length > 0) {
      xml += '  <warnings>\n';
      for (const warning of result.warnings) {
        xml += '    <warning>\n';
        xml += `      <code>${warning.code}</code>\n`;
        if (warning.field) xml += `      <field>${warning.field}</field>\n`;
        xml += `      <message>${this.escapeXML(warning.message)}</message>\n`;
        xml += '    </warning>\n';
      }
      xml += '  </warnings>\n';
    }
    
    xml += '</validationResult>';
    return xml;
  }
  
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
```

### Error Localization
```typescript
interface ErrorLocalization {
  language: string;
  messages: Map<string, Map<ValidationError, string>>;
}

class LocalizedErrorFormatter implements ErrorFormatter {
  constructor(private localization: ErrorLocalization) {}
  
  format(result: ValidationResult): string {
    const messages = this.localization.messages.get(this.localization.language);
    
    const lines: string[] = [];
    
    if (!result.valid) {
      lines.push('Validation failed:');
      
      for (const error of result.errors) {
        const field = error.field ? `Field '${error.field}': ` : '';
        const message = messages?.get(error.code) || error.message;
        lines.push(`  - ${field}${message} (${error.code})`);
      }
    }
    
    return lines.join('\n');
  }
  
  formatJSON(result: ValidationResult): string {
    return JSON.stringify(result, null, 2);
  }
  
  formatXML(result: ValidationResult): string {
    return new DefaultErrorFormatter().formatXML(result);
  }
}
```

## Error Handling Strategies

### Strict Mode
```typescript
class StrictErrorHandler {
  handle(result: ValidationResult): ValidationResult {
    if (!result.valid) {
      throw new ValidationErrorException(result.errors);
    }
    
    return result;
  }
}

class ValidationErrorException extends Error {
  constructor(public errors: ValidationError[]) {
    super('Validation failed');
    this.name = 'ValidationErrorException';
  }
}
```

### Lenient Mode
```typescript
class LenientErrorHandler {
  handle(result: ValidationResult): ValidationResult {
    // Return result even if invalid
    return result;
  }
}
```

### Collect All Errors Mode
```typescript
class CollectAllErrorHandler {
  async validateAll(data: Map<string, any>, schema: ValidationSchema): Promise<ValidationResult> {
    const result = new ValidationResultBuilder();
    
    for (const field of schema.fields) {
      const value = data.get(field.name);
      
      try {
        const fieldResult = await this.validator.validateField(value, field);
        
        if (!fieldResult.valid) {
          for (const error of fieldResult.errors) {
            result.addError(error.code, field.name, error.message, value);
          }
        }
      } catch (error) {
        result.addError(ValidationError.INVALID_TYPE, field.name, 'Field validation failed', value);
      }
    }
    
    return result.build();
  }
}
```

### Fail Fast Mode
```typescript
class FailFastErrorHandler {
  async validate(data: Map<string, any>, schema: ValidationSchema): Promise<ValidationResult> {
    for (const field of schema.fields) {
      const value = data.get(field.name);
      
      const fieldResult = await this.validator.validateField(value, field);
      
      if (!fieldResult.valid) {
        return fieldResult;
      }
    }
    
    return { valid: true, errors: [], warnings: [], metadata: {} };
  }
}
```

## Error Tracking

### Error Statistics
```typescript
interface ErrorStatistics {
  totalValidations: number;
  failedValidations: number;
  errorCounts: Map<ValidationError, number>;
  warningCounts: Map<ValidationWarningCode, number>;
  fieldErrorCounts: Map<string, number>;
  averageValidationTime: number;
}

class ErrorTracker {
  private stats: ErrorStatistics;
  
  recordValidation(result: ValidationResult, duration: number): void {
    this.stats.totalValidations++;
    
    if (!result.valid) {
      this.stats.failedValidations++;
      
      for (const error of result.errors) {
        const count = this.stats.errorCounts.get(error.code) || 0;
        this.stats.errorCounts.set(error.code, count + 1);
        
        if (error.field) {
          const fieldCount = this.stats.fieldErrorCounts.get(error.field) || 0;
          this.stats.fieldErrorCounts.set(error.field, fieldCount + 1);
        }
      }
    }
    
    for (const warning of result.warnings) {
      const count = this.stats.warningCounts.get(warning.code) || 0;
      this.stats.warningCounts.set(warning.code, count + 1);
    }
    
    this.updateAverageTime(duration);
  }
  
  getStatistics(): ErrorStatistics {
    return { ...this.stats };
  }
  
  private updateAverageTime(duration: number): void {
    const total = this.stats.totalValidations;
    const current = this.stats.averageValidationTime;
    this.stats.averageValidationTime = ((current * (total - 1)) + duration) / total;
  }
}
```

## Error Recovery

### Suggested Corrections
```typescript
interface ErrorSuggestion {
  errorCode: ValidationError;
  suggestion: string;
  applySuggestion: (value: any) => any;
}

class ErrorSuggestionProvider {
  private suggestions: Map<ValidationError, ErrorSuggestion> = new Map();
  
  registerSuggestion(suggestion: ErrorSuggestion): void {
    this.suggestions.set(suggestion.errorCode, suggestion);
  }
  
  getSuggestions(error: ValidationError): ErrorSuggestion | undefined {
    return this.suggestions.get(error.code);
  }
  
  applySuggestions(result: ValidationResult, data: Map<string, any>): Map<string, any> {
    const correctedData = new Map(data);
    
    for (const error of result.errors) {
      const suggestion = this.getSuggestions(error);
      
      if (suggestion && error.field) {
        const currentValue = correctedData.get(error.field);
        const correctedValue = suggestion.applySuggestion(currentValue);
        correctedData.set(error.field, correctedValue);
      }
    }
    
    return correctedData;
  }
}

// Example suggestions
const stringTooShortSuggestion: ErrorSuggestion = {
  errorCode: ValidationError.STRING_TOO_SHORT,
  suggestion: 'Pad string with spaces or provide a longer value',
  applySuggestion: (value) => typeof value === 'string' ? value.padEnd(10, ' ') : value
};

const invalidEmailSuggestion: ErrorSuggestion = {
  errorCode: ValidationError.INVALID_EMAIL,
  suggestion: 'Check email format and try again',
  applySuggestion: (value) => typeof value === 'string' ? value.toLowerCase().trim() : value
};
```

## Best Practices

### Error Handling Guidelines
- Provide clear, actionable error messages
- Include field names in error context
- Use consistent error codes
- Log errors for debugging
- Provide suggestions for common errors
- Support multiple error formats (JSON, XML, plain text)

### Error Localization Guidelines
- Support multiple languages
- Provide fallback to English
- Keep translations up to date
- Use professional translators
- Test localized messages

### Error Recovery Guidelines
- Provide suggested corrections
- Allow automatic correction when safe
- Require manual review for security-sensitive errors
- Log correction attempts
- Track correction success rates
