# Parameter Extraction

## Overview
The Router Layer supports parameter extraction from route paths using named parameters with :prefix syntax. Parameters are automatically extracted and can include type validation.

## Parameter Syntax

### Named Parameters
```typescript
// Route definition with parameters
const route: Route = {
  method: HttpMethod.GET,
  path: '/users/:userId/posts/:postId',
  handler: 'getPostHandler',
  parameters: [
    { name: 'userId', type: ParameterType.UUID, required: true },
    { name: 'postId', type: ParameterType.NUMBER, required: true }
  ]
};

// Request: GET /users/abc123/posts/456
// Extracted parameters: { userId: 'abc123', postId: '456' }
```

### Parameter Definition
```typescript
interface RouteParameter {
  name: string;
  type: ParameterType;
  pattern?: string;
  required: boolean;
  defaultValue?: any;
}

enum ParameterType {
  STRING,
  NUMBER,
  BOOLEAN,
  UUID,
  CUSTOM
}
```

## Parameter Extraction

### Extraction Algorithm
```typescript
class ParameterExtractor {
  extract(requestPath: string, routePath: string, parameters: RouteParameter[]): Map<string, any> {
    const extracted = new Map<string, any>();
    const requestSegments = requestPath.split('/');
    const routeSegments = routePath.split('/');
    
    for (let i = 0; i < routeSegments.length; i++) {
      const segment = routeSegments[i];
      
      if (segment.startsWith(':')) {
        const paramName = segment.substring(1);
        const paramDef = parameters.find(p => p.name === paramName);
        
        if (paramDef && i < requestSegments.length) {
          const value = requestSegments[i];
          const validated = this.validateParameter(value, paramDef);
          
          if (validated.valid) {
            extracted.set(paramName, validated.value);
          } else if (paramDef.required) {
            throw new ParameterValidationError(paramName, value, validated.error);
          } else if (paramDef.defaultValue !== undefined) {
            extracted.set(paramName, paramDef.defaultValue);
          }
        }
      }
    }
    
    return extracted;
  }
}
```

### Parameter Validation
```typescript
interface ParameterValidationResult {
  valid: boolean;
  value?: any;
  error?: string;
}

class ParameterValidator {
  validateParameter(value: string, paramDef: RouteParameter): ParameterValidationResult {
    switch (paramDef.type) {
      case ParameterType.STRING:
        return this.validateString(value, paramDef);
      
      case ParameterType.NUMBER:
        return this.validateNumber(value, paramDef);
      
      case ParameterType.BOOLEAN:
        return this.validateBoolean(value, paramDef);
      
      case ParameterType.UUID:
        return this.validateUUID(value, paramDef);
      
      case ParameterType.CUSTOM:
        return this.validateCustom(value, paramDef);
      
      default:
        return { valid: false, error: 'Unknown parameter type' };
    }
  }
  
  private validateString(value: string, paramDef: RouteParameter): ParameterValidationResult {
    if (paramDef.pattern) {
      const pattern = new RegExp(paramDef.pattern);
      if (!pattern.test(value)) {
        return { valid: false, error: 'String does not match pattern' };
      }
    }
    
    return { valid: true, value };
  }
  
  private validateNumber(value: string, paramDef: RouteParameter): ParameterValidationResult {
    const num = Number(value);
    
    if (isNaN(num)) {
      return { valid: false, error: 'Invalid number format' };
    }
    
    return { valid: true, value: num };
  }
  
  private validateBoolean(value: string, paramDef: RouteParameter): ParameterValidationResult {
    if (value === 'true' || value === '1') {
      return { valid: true, value: true };
    }
    
    if (value === 'false' || value === '0') {
      return { valid: true, value: false };
    }
    
    return { valid: false, error: 'Invalid boolean format' };
  }
  
  private validateUUID(value: string, paramDef: RouteParameter): ParameterValidationResult {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      return { valid: false, error: 'Invalid UUID format' };
    }
    
    return { valid: true, value };
  }
  
  private validateCustom(value: string, paramDef: RouteParameter): ParameterValidationResult {
    if (paramDef.pattern) {
      const pattern = new RegExp(paramDef.pattern);
      if (!pattern.test(value)) {
        return { valid: false, error: 'Value does not match custom pattern' };
      }
    }
    
    return { valid: true, value };
  }
}
```

## Pattern Validation

### Custom Patterns
```typescript
// Email parameter
const emailParam: RouteParameter = {
  name: 'email',
  type: ParameterType.STRING,
  pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
  required: true
};

// Date parameter (YYYY-MM-DD)
const dateParam: RouteParameter = {
  name: 'date',
  type: ParameterType.STRING,
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  required: true
};

// Slug parameter
const slugParam: RouteParameter = {
  name: 'slug',
  type: ParameterType.STRING,
  pattern: '^[a-z0-9-]+$',
  required: true
};
```

### Pattern-Based Validation
```typescript
class PatternValidator {
  validate(value: string, pattern: string): boolean {
    const regex = new RegExp(pattern);
    return regex.test(value);
  }
}
```

## Required vs Optional Parameters

### Required Parameters
```typescript
const requiredRoute: Route = {
  method: HttpMethod.GET,
  path: '/users/:userId',
  handler: 'getUserHandler',
  parameters: [
    { name: 'userId', type: ParameterType.UUID, required: true }
  ]
};

// Request: GET /users/ - Will throw ParameterValidationError
// Request: GET /users/abc123 - Will succeed
```

### Optional Parameters
```typescript
const optionalRoute: Route = {
  method: HttpMethod.GET,
  path: '/users/:userId?',
  handler: 'getUserHandler',
  parameters: [
    { 
      name: 'userId', 
      type: ParameterType.UUID, 
      required: false,
      defaultValue: 'default-uuid'
    }
  ]
};

// Request: GET /users/ - Will use default value
// Request: GET /users/abc123 - Will use abc123
```

## Parameter Coercion

### Type Coercion
```typescript
class ParameterCoercer {
  coerce(value: string, type: ParameterType): any {
    switch (type) {
      case ParameterType.NUMBER:
        return Number(value);
      
      case ParameterType.BOOLEAN:
        return value === 'true' || value === '1';
      
      case ParameterType.STRING:
      case ParameterType.UUID:
      case ParameterType.CUSTOM:
        return value;
      
      default:
        return value;
    }
  }
}
```

## Parameter Metadata

### Parameter Metadata
```typescript
interface ParameterMetadata {
  name: string;
  value: any;
  type: ParameterType;
  source: 'path' | 'query' | 'header';
  validated: boolean;
}

class ParameterMetadataTracker {
  track(parameters: Map<string, any>, routeParameters: RouteParameter[]): ParameterMetadata[] {
    const metadata: ParameterMetadata[] = [];
    
    for (const [name, value] of parameters) {
      const paramDef = routeParameters.find(p => p.name === name);
      
      if (paramDef) {
        metadata.push({
          name,
          value,
          type: paramDef.type,
          source: 'path',
          validated: true
        });
      }
    }
    
    return metadata;
  }
}
```

## Best Practices

### Parameter Design Guidelines
- Use descriptive parameter names
- Define parameter types explicitly
- Use pattern validation for complex formats
- Mark required parameters appropriately
- Provide default values for optional parameters

### Validation Guidelines
- Validate all parameters before use
- Use appropriate regex patterns
- Handle validation errors gracefully
- Provide clear error messages
- Log parameter validation failures

### Performance Considerations
- Cache parameter patterns
- Use efficient regex compilation
- Implement early validation
- Minimize parameter extraction overhead
