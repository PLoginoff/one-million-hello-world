# ADR 005: Validation Layer Architecture

## Status
Accepted

## Context
The Validation Layer (Layer 5) is responsible for schema validation, data sanitization, and type checking. It receives requests from the Rate Limiting Layer and ensures data integrity before passing to the Middleware Layer. The layer has been significantly expanded to include advanced validation strategies, comprehensive error handling, cross-field validation, conditional validation, custom validators, sanitization pipelines, health monitoring, diagnostics, and extensive format validation for various data types.

## Decision
We chose to implement the Validation Layer with the following design:

### Components
1. **IValidator Interface**: Defines the contract for validation operations including basic and advanced validation methods
2. **Validator Implementation**: Concrete validator with comprehensive validation rules, statistics tracking, and health monitoring
3. **Type Definitions**: Comprehensive types for validation schemas, results, errors, warnings, and extended features

### Key Design Decisions
- **Schema-based validation**: Use declarative schemas for field validation rules
- **Extended validation results**: Include metrics, context, and sanitization data
- **Cross-field validation**: Support rules that depend on multiple fields
- **Conditional validation**: Apply different schemas based on conditions
- **Custom validators**: Allow user-defined validation logic
- **Sanitization pipeline**: Multiple sanitizers can be applied to data
- **Health monitoring**: Track validation system health and diagnostics
- **Statistics tracking**: Monitor validation performance and error patterns

### Expanded Features
- **Format validation**: UUID, phone, credit card, IP address, hex color, Base64, JSON, XML
- **Advanced sanitization**: Trim, lowercase, uppercase, capitalize, escape HTML, normalize whitespace
- **Validation context**: Track request metadata during validation
- **Nested schema validation**: Support complex object structures
- **Array and object validation**: Length and key constraints
- **Error severity levels**: Error, warning, info
- **Comprehensive error codes**: 28 specific error codes for different validation failures
- **Warning codes**: 10 warning codes for non-critical issues
- **Configuration management**: Runtime control of validation behavior

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

### Isolation Strategy
- Validation Layer depends only on Rate Limiting Layer types
- Does not depend on any higher layers
- Exports only interfaces to Middleware Layer
- Implementation details hidden behind interface

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
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
- ADR 003 - Security Layer Architecture
- ADR 004 - Rate Limiting Layer Architecture
