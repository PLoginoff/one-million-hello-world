# Schema Validation

## Overview
The Validation Layer uses schema-based validation to ensure data integrity and type safety. Schemas define validation rules for fields, including type checking, format validation, and custom validators.

## Schema Definition

### Schema Structure
```typescript
interface ValidationSchema {
  fields: FieldDefinition[];
  crossFieldRules?: CrossFieldRule[];
  conditionalSchemas?: ConditionalSchema[];
  strict?: boolean;
  sanitization?: SanitizationConfig;
}

interface FieldDefinition {
  name: string;
  type: FieldType;
  required?: boolean;
  validation?: ValidationRule[];
  sanitization?: Sanitizer[];
  defaultValue?: any;
  description?: string;
}

enum FieldType {
  STRING,
  NUMBER,
  INTEGER,
  BOOLEAN,
  ARRAY,
  OBJECT,
  DATE,
  EMAIL,
  URL,
  UUID,
  CUSTOM
}
```

### Validation Rules
```typescript
interface ValidationRule {
  type: ValidationRuleType;
  value?: any;
  message?: string;
  validator?: (value: any, context: ValidationContext) => boolean | Promise<boolean>;
}

enum ValidationRuleType {
  MIN_LENGTH,
  MAX_LENGTH,
  MIN_VALUE,
  MAX_VALUE,
  PATTERN,
  EMAIL,
  URL,
  ENUM,
  CUSTOM,
  REQUIRED,
  TYPE
}
```

## Field Validation

### String Validation
```typescript
interface StringValidationRule extends ValidationRule {
  type: ValidationRuleType.MIN_LENGTH | ValidationRuleType.MAX_LENGTH | ValidationRuleType.PATTERN;
}

class StringValidator {
  validate(value: string, rules: StringValidationRule[]): ValidationResult {
    for (const rule of rules) {
      switch (rule.type) {
        case ValidationRuleType.MIN_LENGTH:
          if (value.length < rule.value) {
            return {
              valid: false,
              error: ValidationError.STRING_TOO_SHORT,
              message: rule.message || `String must be at least ${rule.value} characters`
            };
          }
          break;
          
        case ValidationRuleType.MAX_LENGTH:
          if (value.length > rule.value) {
            return {
              valid: false,
              error: ValidationError.STRING_TOO_LONG,
              message: rule.message || `String must not exceed ${rule.value} characters`
            };
          }
          break;
          
        case ValidationRuleType.PATTERN:
          const pattern = new RegExp(rule.value);
          if (!pattern.test(value)) {
            return {
              valid: false,
              error: ValidationError.PATTERN_MISMATCH,
              message: rule.message || 'String does not match required pattern'
            };
          }
          break;
      }
    }
    
    return { valid: true };
  }
}
```

### Number Validation
```typescript
interface NumberValidationRule extends ValidationRule {
  type: ValidationRuleType.MIN_VALUE | ValidationRuleType.MAX_VALUE;
}

class NumberValidator {
  validate(value: number, rules: NumberValidationRule[]): ValidationResult {
    for (const rule of rules) {
      switch (rule.type) {
        case ValidationRuleType.MIN_VALUE:
          if (value < rule.value) {
            return {
              valid: false,
              error: ValidationError.NUMBER_TOO_SMALL,
              message: rule.message || `Number must be at least ${rule.value}`
            };
          }
          break;
          
        case ValidationRuleType.MAX_VALUE:
          if (value > rule.value) {
            return {
              valid: false,
              error: ValidationError.NUMBER_TOO_LARGE,
              message: rule.message || `Number must not exceed ${rule.value}`
            };
          }
          break;
      }
    }
    
    return { valid: true };
  }
}
```

### Email Validation
```typescript
class EmailValidator {
  validate(value: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(value)) {
      return {
        valid: false,
        error: ValidationError.INVALID_EMAIL,
        message: 'Invalid email format'
      };
    }
    
    // Additional checks
    const parts = value.split('@');
    if (parts.length !== 2) {
      return {
        valid: false,
        error: ValidationError.INVALID_EMAIL,
        message: 'Invalid email format'
      };
    }
    
    const [local, domain] = parts;
    
    if (local.length > 64) {
      return {
        valid: false,
        error: ValidationError.EMAIL_LOCAL_TOO_LONG,
        message: 'Email local part too long'
      };
    }
    
    if (domain.length > 255) {
      return {
        valid: false,
        error: ValidationError.EMAIL_DOMAIN_TOO_LONG,
        message: 'Email domain too long'
      };
    }
    
    return { valid: true };
  }
}
```

### URL Validation
```typescript
class URLValidator {
  validate(value: string): ValidationResult {
    try {
      const url = new URL(value);
      
      // Validate protocol
      const allowedProtocols = ['http:', 'https:', 'ftp:'];
      if (!allowedProtocols.includes(url.protocol)) {
        return {
          valid: false,
          error: ValidationError.INVALID_URL_PROTOCOL,
          message: `URL protocol must be one of: ${allowedProtocols.join(', ')}`
        };
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: ValidationError.INVALID_URL,
        message: 'Invalid URL format'
      };
    }
  }
}
```

### UUID Validation
```typescript
class UUIDValidator {
  validate(value: string): ValidationResult {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      return {
        valid: false,
        error: ValidationError.INVALID_UUID,
        message: 'Invalid UUID format'
      };
    }
    
    return { valid: true };
  }
}
```

### Phone Number Validation
```typescript
class PhoneValidator {
  validate(value: string): ValidationResult {
    // Remove non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Check length
    if (digits.length < 10 || digits.length > 15) {
      return {
        valid: false,
        error: ValidationError.INVALID_PHONE,
        message: 'Invalid phone number format'
      };
    }
    
    // Check for valid country code
    if (digits.length === 11 && digits[0] !== '1') {
      return {
        valid: false,
        error: ValidationError.INVALID_PHONE_COUNTRY_CODE,
        message: 'Invalid country code'
      };
    }
    
    return { valid: true };
  }
}
```

### Credit Card Validation
```typescript
class CreditCardValidator {
  validate(value: string): ValidationResult {
    // Remove non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Check length
    if (digits.length < 13 || digits.length > 19) {
      return {
        valid: false,
        error: ValidationError.INVALID_CREDIT_CARD,
        message: 'Invalid credit card number'
      };
    }
    
    // Luhn algorithm
    if (!this.luhnCheck(digits)) {
      return {
        valid: false,
        error: ValidationError.INVALID_CREDIT_CARD_CHECKSUM,
        message: 'Invalid credit card checksum'
      };
    }
    
    return { valid: true };
  }
  
  private luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i], 10);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }
}
```

### IP Address Validation
```typescript
class IPAddressValidator {
  validate(value: string): ValidationResult {
    // IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (ipv4Regex.test(value)) {
      return { valid: true };
    }
    
    // IPv6 validation
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (ipv6Regex.test(value)) {
      return { valid: true };
    }
    
    return {
      valid: false,
      error: ValidationError.INVALID_IP_ADDRESS,
      message: 'Invalid IP address format'
    };
  }
}
```

### Hex Color Validation
```typescript
class HexColorValidator {
  validate(value: string): ValidationResult {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    
    if (!hexColorRegex.test(value)) {
      return {
        valid: false,
        error: ValidationError.INVALID_HEX_COLOR,
        message: 'Invalid hex color format (e.g., #FFFFFF or #FFF)'
      };
    }
    
    return { valid: true };
  }
}
```

### Base64 Validation
```typescript
class Base64Validator {
  validate(value: string): ValidationResult {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    
    if (!base64Regex.test(value)) {
      return {
        valid: false,
        error: ValidationError.INVALID_BASE64,
        message: 'Invalid Base64 format'
      };
    }
    
    // Check padding
    const padding = value.length % 4;
    if (padding !== 0) {
      return {
        valid: false,
        error: ValidationError.INVALID_BASE64_PADDING,
        message: 'Invalid Base64 padding'
      };
    }
    
    return { valid: true };
  }
}
```

### JSON Validation
```typescript
class JSONValidator {
  validate(value: string): ValidationResult {
    try {
      JSON.parse(value);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: ValidationError.INVALID_JSON,
        message: 'Invalid JSON format'
      };
    }
  }
}
```

### XML Validation
```typescript
class XMLValidator {
  validate(value: string): ValidationResult {
    // Basic XML structure check
    const xmlRegex = /^<(\w+)[\s\S]*<\/\1>$/;
    
    if (!xmlRegex.test(value)) {
      return {
        valid: false,
        error: ValidationError.INVALID_XML,
        message: 'Invalid XML format'
      };
    }
    
    // Check for proper nesting (simplified)
    const stack: string[] = [];
    const tagRegex = /<\/?(\w+)[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(value)) !== null) {
      const tag = match[1];
      const isClosing = match[0].startsWith('</');
      
      if (isClosing) {
        if (stack.pop() !== tag) {
          return {
            valid: false,
            error: ValidationError.INVALID_XML_NESTING,
            message: 'Invalid XML nesting'
          };
        }
      } else {
        stack.push(tag);
      }
    }
    
    if (stack.length > 0) {
      return {
        valid: false,
        error: ValidationError.INVALID_XML_NESTING,
        message: 'Unclosed XML tags'
      };
    }
    
    return { valid: true };
  }
}
```

## Cross-Field Validation

### Cross-Field Rules
```typescript
interface CrossFieldRule {
  name: string;
  fields: string[];
  validator: (values: Map<string, any>, context: ValidationContext) => boolean | Promise<boolean>;
  message: string;
}

class CrossFieldValidator {
  private rules: CrossFieldRule[] = [];
  
  addRule(rule: CrossFieldRule): void {
    this.rules.push(rule);
  }
  
  async validate(data: Map<string, any>, context: ValidationContext): Promise<ValidationResult> {
    for (const rule of this.rules) {
      const values = new Map<string, any>();
      
      for (const field of rule.fields) {
        if (data.has(field)) {
          values.set(field, data.get(field));
        }
      }
      
      const isValid = await rule.validator(values, context);
      
      if (!isValid) {
        return {
          valid: false,
          error: ValidationError.CROSS_FIELD_VALIDATION_FAILED,
          message: rule.message,
          fields: rule.fields
        };
      }
    }
    
    return { valid: true };
  }
}
```

### Common Cross-Field Rules
```typescript
// Password confirmation rule
const passwordConfirmationRule: CrossFieldRule = {
  name: 'password-confirmation',
  fields: ['password', 'passwordConfirmation'],
  validator: (values) => values.get('password') === values.get('passwordConfirmation'),
  message: 'Password confirmation does not match'
};

// Date range rule
const dateRangeRule: CrossFieldRule = {
  name: 'date-range',
  fields: ['startDate', 'endDate'],
  validator: (values) => {
    const startDate = new Date(values.get('startDate'));
    const endDate = new Date(values.get('endDate'));
    return startDate <= endDate;
  },
  message: 'Start date must be before end date'
};

// Field dependency rule
const fieldDependencyRule: CrossFieldRule = {
  name: 'field-dependency',
  fields: ['country', 'state'],
  validator: (values) => {
    const country = values.get('country');
    const state = values.get('state');
    
    // If country is US, state is required
    if (country === 'US' && !state) {
      return false;
    }
    
    return true;
  },
  message: 'State is required for US country'
};
```

## Conditional Validation

### Conditional Schemas
```typescript
interface ConditionalSchema {
  condition: (data: Map<string, any>, context: ValidationContext) => boolean | Promise<boolean>;
  schema: ValidationSchema;
}

class ConditionalValidator {
  private conditionalSchemas: ConditionalSchema[] = [];
  
  addConditionalSchema(schema: ConditionalSchema): void {
    this.conditionalSchemas.push(schema);
  }
  
  async validate(data: Map<string, any>, context: ValidationContext): Promise<ValidationResult> {
    for (const conditionalSchema of this.conditionalSchemas) {
      const applies = await conditionalSchema.condition(data, context);
      
      if (applies) {
        return await this.validator.validateWithSchema(data, conditionalSchema.schema, context);
      }
    }
    
    return { valid: true };
  }
}
```

### Common Conditional Patterns
```typescript
// Role-based validation
const roleBasedSchema: ConditionalSchema = {
  condition: (data, context) => context.userRole === 'admin',
  schema: adminValidationSchema
};

// Feature flag validation
const featureFlagSchema: ConditionalSchema = {
  condition: (data, context) => context.features.includes('advanced-validation'),
  schema: advancedValidationSchema
};

// Data type based validation
const dataTypeSchema: ConditionalSchema = {
  condition: (data, context) => data.get('type') === 'premium',
  schema: premiumValidationSchema
};
```

## Custom Validators

### Custom Validator Interface
```typescript
interface CustomValidator {
  name: string;
  validate: (value: any, context: ValidationContext) => boolean | Promise<boolean>;
  message?: string;
}

class CustomValidatorRegistry {
  private validators: Map<string, CustomValidator> = new Map();
  
  register(validator: CustomValidator): void {
    this.validators.set(validator.name, validator);
  }
  
  unregister(name: string): void {
    this.validators.delete(name);
  }
  
  get(name: string): CustomValidator | undefined {
    return this.validators.get(name);
  }
  
  async validate(name: string, value: any, context: ValidationContext): Promise<ValidationResult> {
    const validator = this.validators.get(name);
    
    if (!validator) {
      return {
        valid: false,
        error: ValidationError.UNKNOWN_VALIDATOR,
        message: `Unknown validator: ${name}`
      };
    }
    
    const isValid = await validator.validate(value, context);
    
    if (!isValid) {
      return {
        valid: false,
        error: ValidationError.CUSTOM_VALIDATION_FAILED,
        message: validator.message || 'Custom validation failed'
      };
    }
    
    return { valid: true };
  }
}
```

## Best Practices

### Schema Design
- Use descriptive field names
- Provide clear error messages
- Keep schemas focused and single-purpose
- Reuse common validation rules
- Document complex validation logic

### Performance Optimization
- Cache compiled regex patterns
- Use simple type checks before complex validations
- Implement early termination for required fields
- Optimize cross-field validation order

### Security Considerations
- Sanitize input before validation
- Use whitelisting for allowed values
- Validate against malicious patterns
- Implement rate limiting for validation
