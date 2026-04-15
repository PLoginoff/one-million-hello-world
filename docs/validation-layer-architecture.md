# ADR: Validation Layer Architecture

## Status
Accepted

## Context
The Validation Layer is responsible for schema validation, data sanitization, and type checking. It receives requests from the Rate Limiting Layer and ensures data integrity before passing to the Middleware Layer. The layer has been significantly expanded to include advanced validation strategies, comprehensive error handling, cross-field validation, conditional validation, custom validators, sanitization pipelines, health monitoring, diagnostics, and extensive format validation for various data types.

## Decision
We chose to implement the Validation Layer with the following design:

### Components
1. **IValidator Interface**: Defines the contract for validation operations including basic and advanced validation methods
2. **Validator Implementation**: Concrete validator with comprehensive validation rules, statistics tracking, and health monitoring
3. **Type Definitions**: Comprehensive types for validation schemas, results, errors, warnings, and extended features

### Key Design Decisions

**Schema-Based Validation**
- Declarative validation schemas
- Field-level validation rules
- Required field checking
- Type validation with multiple types supported

**Validation Rules**
- String length validation (min/max)
- Pattern matching with regex
- Email format validation
- URL format validation
- Number range validation
- Enum value validation
- Custom validator support

**Sanitization**
- HTML entity encoding
- Malicious content detection
- Field removal for security
- XSS prevention
- Trim whitespace

**Error Reporting**
- Detailed error messages
- Error codes for categorization
- Field-level error tracking
- Warning system for non-critical issues

**Configuration**
- Default schema support
- Runtime schema updates
- Strict mode toggle
- Sanitization enable/disable

### Expanded Features

**Format Validation**
- UUID format validation
- Phone number format validation
- Credit card format validation
- IP address format validation
- Hex color format validation
- Base64 format validation
- JSON format validation
- XML format validation

**Advanced Sanitization**
- Trim whitespace
- Convert to lowercase
- Convert to uppercase
- Capitalize text
- Escape HTML entities
- Normalize whitespace

**Validation Context**
- Track request metadata during validation
- Pass context to custom validators
- Support conditional validation based on context

**Nested Schema Validation**
- Support complex object structures
- Validate nested objects
- Validate arrays of objects
- Support recursive schemas

**Array and Object Validation**
- Length constraints for arrays
- Key constraints for objects
- Item validation for arrays
- Property validation for objects

**Error Severity Levels**
- Error: Critical validation failures
- Warning: Non-critical issues
- Info: Informational messages

**Comprehensive Error Codes**
- 28 specific error codes for different validation failures
- Categorized error codes for easy handling
- Detailed error descriptions

**Warning Codes**
- 10 warning codes for non-critical issues
- Warning severity levels
- Warning suppression options

**Configuration Management**
- Runtime control of validation behavior
- Schema versioning
- Validation mode switching

### Isolation Strategy
- Validation Layer depends only on Rate Limiting Layer types
- Does not depend on any higher layers
- Exports only interfaces to Middleware Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Validation Layer, see:

- [Architecture Overview](../src/layers/validation/docs/architecture.md) - Components, isolation strategy, consequences
- [Schema Validation](../src/layers/validation/docs/schema-validation.md) - Schema-based validation, field validators, format validation
- [Sanitization](../src/layers/validation/docs/sanitization.md) - Sanitization pipeline, built-in sanitizers
- [Error Handling](../src/layers/validation/docs/error-handling.md) - Error codes, reporting, localization
- [Testing Strategy](../src/layers/validation/docs/testing.md) - Unit/integration tests, security tests, coverage targets

## Consequences

### Positive
- Comprehensive validation capabilities
- Flexible schema system
- Security-focused sanitization
- Detailed error reporting
- Type-safe validation

### Negative
- Additional validation overhead
- Schema complexity for complex data
- False positives in sanitization
- Performance impact from regex operations

### Alternatives Considered
1. **Use Zod library**: Rejected for control and learning purposes
2. **No sanitization**: Rejected for security requirements
3. **Simple type checking only**: Rejected for comprehensive validation
4. **Schema-less validation**: Rejected for maintainability

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- network-layer-architecture.md - Network Layer Architecture
- http-parser-layer-architecture.md - HTTP Parser Layer Architecture
- security-layer-architecture.md - Security Layer Architecture
- rate-limiting-layer-architecture.md - Rate Limiting Layer Architecture
