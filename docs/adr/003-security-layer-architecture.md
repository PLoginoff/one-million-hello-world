# ADR 003: Security Layer Architecture

## Status
Accepted

## Context
The Security Layer (Layer 3) is responsible for authentication, authorization, CORS validation, and threat detection. It receives parsed HTTP requests from the HTTP Parser Layer and ensures security before passing to the Rate Limiting Layer.

## Decision
We chose to implement the Security Layer with the following design:

### Components
1. **ISecurityManager Interface**: Defines the contract for security operations
2. **SecurityManager Implementation**: Concrete security manager with all security features
3. **Type Definitions**: Comprehensive types for security contexts and threats

### Key Design Decisions

**Authentication Strategy**
- Support for multiple authentication methods (Bearer tokens, API keys, Basic Auth, JWT, OAuth2, Session Cookie, Signature)
- Token validation with Bearer prefix
- API key validation via headers
- Anonymous context creation when auth not required
- Extended authentication with metrics and warnings
- Token and session information tracking

**Authorization Model**
- Role-based access control (RBAC)
- Permission-based authorization
- Security context propagation
- Flexible permission checking
- Extended security context with IP info, token info, session info

**CORS Validation**
- Configurable CORS policies
- Origin whitelist support
- Wildcard origin support
- Method and header validation
- Credentials and max age configuration

**Threat Detection**
- Pattern-based threat detection for 13 threat types
- XSS, SQL injection, CSRF, path traversal, DDoS, malicious user agent
- Command injection, LDAP injection, XML injection, SSRF, XXE
- Header injection, protocol violation detection
- Extended threat detection with patterns, risk score, and recommendations
- Custom threat pattern management

**Security Policy**
- Centralized policy configuration
- Runtime policy updates
- Request size validation
- Header size validation
- Auth requirement toggle
- Required headers validation
- Allowed content types validation

**Rate Limiting**
- Configurable rate limiting per IP
- Sliding window algorithm
- Burst protection support
- Skip successful/failed requests options
- Rate limit statistics tracking

**IP Filtering**
- IP whitelist and blacklist support
- Private IP filtering
- Tor exit node detection
- VPN detection
- IP geolocation information

**User Agent Filtering**
- Blocked and allowed patterns
- Required user agent validation
- Malicious user agent detection

**Signature Validation**
- HMAC-SHA256, HMAC-SHA512, RSA-SHA256 algorithms
- Configurable header name and secret key
- Request signature verification

**Timestamp Validation**
- Configurable max age
- Clock skew tolerance
- Request timestamp verification

**Nonce Validation**
- Nonce reuse prevention
- Configurable max age
- Automatic cleanup of expired nonces

**Statistics and Monitoring**
- Comprehensive security statistics tracking
- Authentication success/failure rates
- Threat detection by type
- CORS violations, rate limit violations, IP blocks
- Average authentication time
- Health status checks
- Diagnostic capabilities with trace ID

**Audit Logging**
- Security event logging
- Configurable log size limit
- Event types for all security operations
- IP address and user agent tracking

### Isolation Strategy
- Security Layer depends only on HTTP Parser Layer types
- Does not depend on any higher layers
- Exports only interfaces to Rate Limiting Layer
- Implementation details hidden behind interface

## Consequences

### Positive
- Comprehensive security coverage
- Flexible authentication methods
- Configurable security policies
- Pattern-based threat detection
- Type-safe security contexts

### Negative
- Pattern-based detection may have false positives
- Additional latency from security checks
- Complexity from multiple security features
- Memory overhead from security contexts

### Alternatives Considered
1. **Use dedicated auth library**: Rejected for control and learning purposes
2. **Separate auth and threat detection layers**: Rejected for cohesion
3. **No threat detection**: Rejected for security requirements
4. **JWT-only authentication**: Rejected for flexibility

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
