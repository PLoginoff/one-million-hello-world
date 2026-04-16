# Versioning

## Overview
The Serialization Layer implements versioning with optional version wrapping, version field in serialized output, configurable version string, and version extraction on deserialize.

## Versioning Structure

### Versioned Data
```typescript
interface VersionedData {
  version: string;
  data: any;
}

interface VersionConfig {
  enabled: boolean;
  version: string;
  versionField: string;
}
```

### Version Wrapper
```typescript
class VersionWrapper {
  private config: VersionConfig;
  
  constructor(config: VersionConfig) {
    this.config = config;
  }
  
  wrap(data: any): VersionedData {
    if (!this.config.enabled) {
      return { version: this.config.version, data };
    }
    
    return {
      version: this.config.version,
      data
    };
  }
  
  unwrap(versionedData: VersionedData): any {
    if (!this.config.enabled) {
      return versionedData.data;
    }
    
    return versionedData.data;
  }
  
  extractVersion(data: any): string | null {
    if (typeof data !== 'object' || data === null) {
      return null;
    }
    
    if (this.config.versionField in data) {
      return data[this.config.versionField];
    }
    
    return null;
  }
  
  enable(): void {
    this.config.enabled = true;
  }
  
  disable(): void {
    this.config.enabled = false;
  }
  
  setVersion(version: string): void {
    this.config.version = version;
  }
  
  setVersionField(field: string): void {
    this.config.versionField = field;
  }
}
```

## Versioned Serializer

### Versioned Serializer
```typescript
class VersionedSerializer {
  private serializer: Serializer;
  private versionWrapper: VersionWrapper;
  
  constructor(serializer: Serializer, versionWrapper: VersionWrapper) {
    this.serializer = serializer;
    this.versionWrapper = versionWrapper;
  }
  
  serialize(data: any, format: SerializationFormat): SerializationResult {
    const versioned = this.versionWrapper.wrap(data);
    return this.serializer.serialize(versioned, format);
  }
  
  deserialize(serialized: string, format: SerializationFormat): any {
    const data = this.serializer.deserialize(serialized, format);
    return this.versionWrapper.unwrap(data);
  }
  
  getVersion(serialized: string, format: SerializationFormat): string | null {
    const data = this.serializer.deserialize(serialized, format);
    return this.versionWrapper.extractVersion(data);
  }
}
```

## Version Configuration

### Configuration Manager
```typescript
class VersionConfigManager {
  private config: VersionConfig;
  
  constructor(defaultConfig: VersionConfig) {
    this.config = defaultConfig;
  }
  
  enable(): void {
    this.config.enabled = true;
  }
  
  disable(): void {
    this.config.enabled = false;
  }
  
  setVersion(version: string): void {
    this.config.version = version;
  }
  
  setVersionField(field: string): void {
    this.config.versionField = field;
  }
  
  getConfig(): VersionConfig {
    return { ...this.config };
  }
}
```

## Best Practices

### Versioning Guidelines
- Use semantic versioning
- Document version changes
- Maintain backward compatibility
- Test version extraction
- Use version field consistently

### Migration Guidelines
- Support multiple versions when needed
- Provide migration paths
- Document breaking changes
- Use version negotiation
