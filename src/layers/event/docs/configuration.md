# Configuration Layer Documentation

## Overview
The Configuration Layer provides configuration management for the Event Layer. This layer handles configuration validation, loading from various sources, and runtime configuration management.

## Components

### EventBusConfig

- **Purpose**: Configuration object for the event bus
- **Location**: `configuration/EventBusConfig.ts`
- **Configuration Options**:
  - `enableAsync`: Enable asynchronous event processing (default: true)
  - `enablePersistence`: Enable event persistence (default: false)
  - `maxQueueSize`: Maximum queue size (default: 1000, range: 1-100000)
  - `maxSubscriptions`: Maximum subscriptions (default: 10000, range: 1-1000000)
  - `timeout`: Handler execution timeout in ms (default: 5000, range: 1-60000)
  - `retryOnFailure`: Retry failed handlers (default: false)
  - `maxRetries`: Maximum retry attempts (default: 3, range: 0-10)
  - `enableMetrics`: Enable metrics collection (default: true)
  - `enableLogging`: Enable logging (default: true)
  - `logLevel`: Log level (default: 'info', options: 'debug', 'info', 'warn', 'error')
  - `serializationFormat`: Serialization format (default: 'json', options: 'json', 'protobuf', 'msgpack')

**Usage Example**:
```typescript
import { EventBusConfig } from './configuration';

// Default configuration
const defaultConfig = EventBusConfig.default();

// Custom configuration
const customConfig = EventBusConfig.create({
  enableAsync: false,
  maxQueueSize: 500,
  timeout: 10000,
  retryOnFailure: true,
  maxRetries: 5,
});

// Merge options
const mergedConfig = defaultConfig.withOptions({
  maxQueueSize: 2000,
  logLevel: 'debug',
});

// Serialize to JSON
const json = customConfig.toJSON();

// Deserialize from JSON
const fromJson = EventBusConfig.fromJSON(json);
```

### ConfigValidator

- **Purpose**: Validate configuration objects
- **Location**: `configuration/ConfigValidator.ts`
- **Validation Rules**:
  - `maxQueueSize`: Must be between 1 and 100000
  - `maxSubscriptions`: Must be between 1 and 1000000
  - `timeout`: Must be between 1 and 60000
  - `maxRetries`: Must be between 0 and 10
  - `logLevel`: Must be one of 'debug', 'info', 'warn', 'error'
  - `serializationFormat`: Must be one of 'json', 'protobuf', 'msgpack'

**Features**:
  - Default validation rules
  - Custom validation rules
  - Rule removal
  - Validation result with errors and warnings
  - Field-specific error messages

**Usage Example**:
```typescript
import { ConfigValidator } from './configuration';
import { EventBusConfig } from './configuration';

const validator = new ConfigValidator();
const config = EventBusConfig.create({ maxQueueSize: 0 });

const result = validator.validate(config);
console.log(result.valid); // false
console.log(result.errors); // [{ field: 'maxQueueSize', message: '...', value: 0 }]

// Add custom rule
const customRule = {
  name: 'custom-rule',
  validate: (config) => config.maxQueueSize >= 100,
  defaultMessage: 'maxQueueSize must be at least 100',
};

validator.addRule(customRule);

// Remove rule
validator.removeRule('maxQueueSize');
```

### ConfigLoader

- **Purpose**: Load configuration from various sources
- **Location**: `configuration/ConfigLoader.ts`
- **Load Sources**:
  - Environment variables
  - Configuration files
  - Programmatic options
  - Default values

**Features**:
  - Environment variable loading with prefix
  - File-based configuration loading
  - Programmatic configuration
  - Default configuration
  - Automatic type conversion
  - Validation after loading
  - Source tracking

**Usage Example**:
```typescript
import { ConfigLoader } from './configuration';

const loader = new ConfigLoader('EVENT_BUS_');

// Load from environment variables
const fromEnv = loader.loadFromEnv();

// Load from file
const fromFile = loader.loadFromFile('/path/to/config.json');

// Load from programmatic options
const fromProgrammatic = loader.loadFromProgrammatic({
  enableAsync: false,
  maxQueueSize: 500,
});

// Load default
const fromDefault = loader.loadDefault();

// Load with automatic source detection
const loaded = loader.load();
console.log(loaded.source); // 'env', 'file', 'programmatic', or 'default'
console.log(loaded.config); // EventBusConfig instance
console.log(loaded.validationResult); // ValidationResult
```

**Environment Variables**:
- `EVENT_BUS_ENABLE_ASYNC`: Boolean
- `EVENT_BUS_ENABLE_PERSISTENCE`: Boolean
- `EVENT_BUS_MAX_QUEUE_SIZE`: Number
- `EVENT_BUS_MAX_SUBSCRIPTIONS`: Number
- `EVENT_BUS_TIMEOUT`: Number
- `EVENT_BUS_RETRY_ON_FAILURE`: Boolean
- `EVENT_BUS_MAX_RETRIES`: Number
- `EVENT_BUS_ENABLE_METRICS`: Boolean
- `EVENT_BUS_ENABLE_LOGGING`: Boolean
- `EVENT_BUS_LOG_LEVEL`: String
- `EVENT_BUS_SERIALIZATION_FORMAT`: String

## Design Principles

### Configuration as Code
Configuration is defined in code and can be version controlled.

### Validation First
All configurations are validated before use.

### Multiple Sources
Configuration can come from multiple sources with priority:
1. Programmatic options (highest priority)
2. Environment variables
3. Configuration files
4. Default values (lowest priority)

### Type Safety
Configuration is fully typed with TypeScript.

### Immutability
Configuration objects are immutable with `withOptions()` method.

## Integration with Other Layers

- **Core Layer**: EventBus uses EventBusConfig for configuration
- **Application Layer**: EventDispatcher respects configuration
- **Monitoring Layer**: Metrics and logging respect enable/disable flags
- **Infrastructure Layer**: Event stores and queues respect configuration

## Configuration Best Practices

1. **Use Environment Variables for Deployment**: Keep environment-specific config in environment variables
2. **Use Files for Development**: Use configuration files for local development
3. **Validate Early**: Validate configuration at application startup
4. **Document Defaults**: Document all default values and ranges
5. **Type Check**: Use TypeScript to catch configuration errors at compile time

## Testing
Configuration Layer tests are located in `__tests__/configuration/`:
- `EventBusConfig.test.ts`
- `ConfigValidator.test.ts`
- `ConfigLoader.test.ts`

All tests cover configuration creation, validation, loading, and edge cases.
