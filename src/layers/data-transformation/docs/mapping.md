# Mapping

## Overview
The Data Transformation Layer implements mapping with field-to-field mapping, transform function support, error handling for missing fields, and configurable mapping toggle.

## Mapping Structure

### Mapping Definition
```typescript
interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

interface MappingConfig {
  enabled: boolean;
  mappings: FieldMapping[];
  ignoreMissingFields: boolean;
}
```

### Field Mapper
```typescript
class FieldMapper {
  private config: MappingConfig;
  
  constructor(config: MappingConfig) {
    this.config = config;
  }
  
  map(source: any): any {
    if (!this.config.enabled) {
      return source;
    }
    
    const target: any = {};
    
    for (const mapping of this.config.mappings) {
      try {
        const value = this.getValue(source, mapping);
        
        if (value !== undefined || mapping.defaultValue !== undefined) {
          const transformedValue = mapping.transform 
            ? mapping.transform(value)
            : value;
          
          target[mapping.targetField] = transformedValue !== undefined 
            ? transformedValue 
            : mapping.defaultValue;
        } else if (mapping.required) {
          throw new MappingError(`Required field '${mapping.sourceField}' is missing`);
        }
      } catch (error) {
        if (mapping.required) {
          throw error;
        }
      }
    }
    
    return target;
  }
  
  private getValue(source: any, mapping: FieldMapping): any {
    const parts = mapping.sourceField.split('.');
    let value = source;
    
    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      
      value = value[part];
    }
    
    return value;
  }
}
```

### Mapping Builder
```typescript
class MappingBuilder {
  private mappings: FieldMapping[] = [];
  
  addMapping(mapping: FieldMapping): this {
    this.mappings.push(mapping);
    return this;
  }
  
  addFieldMapping(sourceField: string, targetField: string): this {
    this.mappings.push({
      sourceField,
      targetField
    });
    return this;
  }
  
  addTransformedMapping(sourceField: string, targetField: string, transform: (value: any) => any): this {
    this.mappings.push({
      sourceField,
      targetField,
      transform
    });
    return this;
  }
  
  addRequiredMapping(sourceField: string, targetField: string): this {
    this.mappings.push({
      sourceField,
      targetField,
      required: true
    });
    return this;
  }
  
  addMappingWithDefault(sourceField: string, targetField: string, defaultValue: any): this {
    this.mappings.push({
      sourceField,
      targetField,
      defaultValue
    });
    return this;
  }
  
  build(): FieldMapping[] {
    return [...this.mappings];
  }
}
```

## Transform Functions

### Common Transforms
```typescript
class TransformFunctions {
  static toString(value: any): string {
    return String(value);
  }
  
  static toNumber(value: any): number {
    return Number(value);
  }
  
  static toBoolean(value: any): boolean {
    return Boolean(value);
  }
  
  static toDate(value: any): Date {
    return new Date(value);
  }
  
  static toUpperCase(value: string): string {
    return value.toUpperCase();
  }
  
  static toLowerCase(value: string): string {
    return value.toLowerCase();
  }
  
  static trim(value: string): string {
    return value.trim();
  }
  
  static custom(transform: (value: any) => any): (value: any) => any {
    return transform;
  }
}
```

## Mapping Configuration

### Configuration Manager
```typescript
class MappingConfigManager {
  private config: MappingConfig;
  
  constructor(defaultConfig: MappingConfig) {
    this.config = defaultConfig;
  }
  
  enable(): void {
    this.config.enabled = true;
  }
  
  disable(): void {
    this.config.enabled = false;
  }
  
  setMappings(mappings: FieldMapping[]): void {
    this.config.mappings = mappings;
  }
  
  addMapping(mapping: FieldMapping): void {
    this.config.mappings.push(mapping);
  }
  
  setIgnoreMissingFields(ignore: boolean): void {
    this.config.ignoreMissingFields = ignore;
  }
  
  getConfig(): MappingConfig {
    return { ...this.config, mappings: [...this.config.mappings] };
  }
}
```

## Best Practices

### Mapping Guidelines
- Use descriptive field names
- Document mapping rules
- Handle missing fields gracefully
- Use transforms for data conversion
- Test mappings thoroughly

### Error Handling Guidelines
- Validate required fields
- Provide default values when appropriate
- Log mapping errors
- Use type-safe transforms
