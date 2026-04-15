# Sanitization

## Overview
The Validation Layer includes a comprehensive sanitization pipeline to clean and secure input data. Sanitization removes or transforms potentially harmful content before validation and processing.

## Sanitization Pipeline

### Sanitizer Interface
```typescript
interface Sanitizer {
  name: string;
  sanitize: (value: any, context: SanitizationContext) => any;
}

interface SanitizationContext {
  fieldName: string;
  fieldType: FieldType;
  metadata: Map<string, any>;
}

interface SanitizationConfig {
  enabled: boolean;
  sanitizers: Sanitizer[];
  order: 'sequential' | 'parallel';
}
```

### Sanitization Pipeline
```typescript
class SanitizationPipeline {
  private sanitizers: Map<string, Sanitizer> = new Map();
  
  register(sanitizer: Sanitizer): void {
    this.sanitizers.set(sanitizer.name, sanitizer);
  }
  
  async sanitize(value: any, config: SanitizationConfig, context: SanitizationContext): Promise<any> {
    if (!config.enabled) {
      return value;
    }
    
    let result = value;
    
    for (const sanitizerConfig of config.sanitizers) {
      const sanitizer = this.sanitizers.get(sanitizerConfig.name);
      
      if (sanitizer) {
        result = await sanitizer.sanitize(result, context);
      }
    }
    
    return result;
  }
}
```

## Built-in Sanitizers

### Trim Sanitizer
```typescript
class TrimSanitizer implements Sanitizer {
  name = 'trim';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }
}
```

### Lowercase Sanitizer
```typescript
class LowercaseSanitizer implements Sanitizer {
  name = 'lowercase';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
    return value;
  }
}
```

### Uppercase Sanitizer
```typescript
class UppercaseSanitizer implements Sanitizer {
  name = 'uppercase';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  }
}
```

### Capitalize Sanitizer
```typescript
class CapitalizeSanitizer implements Sanitizer {
  name = 'capitalize';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }
    return value;
  }
}
```

### Escape HTML Sanitizer
```typescript
class EscapeHTMLSanitizer implements Sanitizer {
  name = 'escape-html';
  
  private htmlEntities: Map<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;']
  ]);
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      let result = value;
      
      for (const [char, entity] of this.htmlEntities) {
        result = result.replace(new RegExp(char, 'g'), entity);
      }
      
      return result;
    }
    return value;
  }
}
```

### Normalize Whitespace Sanitizer
```typescript
class NormalizeWhitespaceSanitizer implements Sanitizer {
  name = 'normalize-whitespace';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    return value;
  }
}
```

### Remove Script Tags Sanitizer
```typescript
class RemoveScriptTagsSanitizer implements Sanitizer {
  name = 'remove-script-tags';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove script tags and content
      return value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    }
    return value;
  }
}
```

### Remove Style Tags Sanitizer
```typescript
class RemoveStyleTagsSanitizer implements Sanitizer {
  name = 'remove-style-tags';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove style tags and content
      return value.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    return value;
  }
}
```

### Remove Comments Sanitizer
```typescript
class RemoveCommentsSanitizer implements Sanitizer {
  name = 'remove-comments';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove HTML comments
      return value.replace(/<!--[\s\S]*?-->/g, '');
    }
    return value;
  }
}
```

### Strip Tags Sanitizer
```typescript
class StripTagsSanitizer implements Sanitizer {
  name = 'strip-tags';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove all HTML tags
      return value.replace(/<[^>]*>/g, '');
    }
    return value;
  }
}
```

### XSS Sanitizer
```typescript
class XSSSanitizer implements Sanitizer {
  name = 'xss';
  
  private xssPatterns: RegExp[] = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[^>]*>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    /<meta\b[^<]*(?:(?!<\/meta>)<[^<]*)*<\/meta>/gi
  ];
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      let result = value;
      
      for (const pattern of this.xssPatterns) {
        result = result.replace(pattern, '');
      }
      
      return result;
    }
    return value;
  }
}
```

### SQL Injection Sanitizer
```typescript
class SQLInjectionSanitizer implements Sanitizer {
  name = 'sql-injection';
  
  private sqlPatterns: RegExp[] = [
    /('|(\-\-)|(;)|(\|)|(\/\*)|(\*\/))/gi,
    /\b(union|select|insert|update|delete|drop|alter|create)\b/gi,
    /\b(or|and)\s+\d+\s*=\s*\d+/gi,
    /exec\s*\(/gi,
    /xp_cmdshell/gi,
    /sp_executesql/gi
  ];
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      let result = value;
      
      for (const pattern of this.sqlPatterns) {
        result = result.replace(pattern, '');
      }
      
      return result;
    }
    return value;
  }
}
```

### Remove Null Bytes Sanitizer
```typescript
class RemoveNullBytesSanitizer implements Sanitizer {
  name = 'remove-null-bytes';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/\x00/g, '');
    }
    
    if (Buffer.isBuffer(value)) {
      return value.filter(byte => byte !== 0);
    }
    
    return value;
  }
}
```

### Remove Control Characters Sanitizer
```typescript
class RemoveControlCharactersSanitizer implements Sanitizer {
  name = 'remove-control-characters';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove control characters except tab, newline, carriage return
      return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    return value;
  }
}
```

### Remove Excess Spaces Sanitizer
```typescript
class RemoveExcessSpacesSanitizer implements Sanitizer {
  name = 'remove-excess-spaces';
  
  sanitize(value: any): any {
    if (typeof value === 'string') {
      // Remove multiple spaces, tabs, and newlines
      return value.replace(/[ \t\n\r]+/g, ' ').trim();
    }
    return value;
  }
}
```

## Field Removal

### Field Removal Sanitizer
```typescript
interface FieldRemovalConfig {
  fields: string[];
  reason: string;
}

class FieldRemovalSanitizer implements Sanitizer {
  name = 'field-removal';
  
  constructor(private config: FieldRemovalConfig) {}
  
  sanitize(value: any, context: SanitizationContext): any {
    if (this.config.fields.includes(context.fieldName)) {
      // Log field removal
      this.auditLogger.logFieldRemoval(context.fieldName, this.config.reason);
      return null;
    }
    
    return value;
  }
}
```

### Sensitive Field Removal
```typescript
const sensitiveFieldsConfig: FieldRemovalConfig = {
  fields: ['password', 'creditCard', 'ssn', 'apiKey', 'secret'],
  reason: 'Sensitive field removed for security'
};

const sensitiveFieldRemover = new FieldRemovalSanitizer(sensitiveFieldsConfig);
```

## Sanitization Context

### Context Tracking
```typescript
interface SanitizationContext {
  fieldName: string;
  fieldType: FieldType;
  metadata: Map<string, any>;
  requestMetadata: RequestMetadata;
}

interface RequestMetadata {
  requestId: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

class SanitizationContextBuilder {
  build(request: HttpRequest, fieldName: string, fieldType: FieldType): SanitizationContext {
    return {
      fieldName,
      fieldType,
      metadata: new Map(),
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

## Sanitization Strategies

### Per-Field Sanitization
```typescript
interface FieldSanitizationConfig {
  [fieldName: string]: SanitizationConfig;
}

class FieldSanitizationStrategy {
  private configs: FieldSanitizationConfig;
  
  constructor(configs: FieldSanitizationConfig) {
    this.configs = configs;
  }
  
  async sanitizeField(fieldName: string, value: any, context: SanitizationContext): Promise<any> {
    const config = this.configs[fieldName];
    
    if (!config) {
      return value;
    }
    
    return await this.pipeline.sanitize(value, config, context);
  }
}
```

### Global Sanitization
```typescript
class GlobalSanitizationStrategy {
  private config: SanitizationConfig;
  
  constructor(config: SanitizationConfig) {
    this.config = config;
  }
  
  async sanitizeAll(data: Map<string, any>, contextBuilder: SanitizationContextBuilder): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    
    for (const [fieldName, value] of data) {
      const context = contextBuilder.build(fieldName, FieldType.STRING);
      result.set(fieldName, await this.pipeline.sanitize(value, this.config, context));
    }
    
    return result;
  }
}
```

### Conditional Sanitization
```typescript
interface ConditionalSanitizationConfig {
  condition: (value: any, context: SanitizationContext) => boolean;
  config: SanitizationConfig;
}

class ConditionalSanitizationStrategy {
  private configs: ConditionalSanitizationConfig[];
  
  constructor(configs: ConditionalSanitizationConfig[]) {
    this.configs = configs;
  }
  
  async sanitize(value: any, context: SanitizationContext): Promise<any> {
    for (const config of this.configs) {
      if (config.condition(value, context)) {
        return await this.pipeline.sanitize(value, config.config, context);
      }
    }
    
    return value;
  }
}
```

## Best Practices

### Sanitization Guidelines
- Sanitize input before validation
- Use multiple sanitizers for comprehensive protection
- Apply sanitization consistently across all inputs
- Log sanitization actions for audit trails
- Test sanitization with malicious input samples

### Performance Considerations
- Cache sanitization results when possible
- Use efficient regex patterns
- Implement early termination for null values
- Batch sanitization operations

### Security Considerations
- Sanitize all user input
- Use whitelisting for allowed characters
- Implement rate limiting for sanitization
- Regularly update sanitization patterns
- Monitor for evasion techniques
