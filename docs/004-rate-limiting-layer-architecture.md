# ADR 004: Rate Limiting Layer Architecture

## Status
Accepted

## Context
The Rate Limiting Layer (Layer 4) is responsible for rate limiting requests based on IP addresses, user IDs, and API keys. It receives requests from the Security Layer and ensures rate limit compliance before passing to the Validation Layer. The layer has been significantly expanded to include advanced rate limiting strategies, comprehensive statistics tracking, health monitoring, diagnostics, rule-based rate limiting, exception handling, tiered rate limits, quota management, and warning systems.

## Decision
We chose to implement the Rate Limiting Layer with the following design:

### Components
1. **IRateLimiter Interface**: Defines the contract for rate limiting operations
2. **RateLimiter Implementation**: Concrete rate limiter with token bucket strategy
3. **Type Definitions**: Comprehensive types for rate limiting strategies and identifiers

### Key Design Decisions

**Rate Limiting Strategies**
- Token bucket algorithm as default strategy
- Support for multiple strategies (sliding window, fixed window, leaky bucket)
- Configurable window size and request limits
- Burst capacity for traffic spikes
- Grace period for burst protection
- Priority queuing for high-priority requests

**Identifier Types**
- IP-based rate limiting for anonymous users
- User ID-based rate limiting for authenticated users
- API key-based rate limiting for API clients
- Custom identifier support for special cases
- Multiple scopes (global, per-user, per-API key, per-IP, per-endpoint, custom)

**Token Bucket Algorithm**
- Tokens refill at a constant rate
- Burst capacity allows short traffic spikes
- Tokens consumed on each request
- Automatic token refill based on time elapsed

**Sliding Window Algorithm**
- Tracks request timestamps within sliding window
- More accurate rate limiting than fixed window
- Handles traffic bursts gracefully
- Configurable window size and request limits

**Fixed Window Algorithm**
- Simple counter-based approach
- Resets at fixed intervals
- Easy to understand and implement
- May allow double the limit at window boundaries

**Leaky Bucket Algorithm**
- Constant rate of request processing
- Queue for burst handling
- Smooths out traffic patterns
- Configurable leak rate and bucket size

**Statistics Tracking**
- Total request count
- Allowed request count
- Denied request count
- Current bucket count
- Total buckets created and expired
- Average and peak request rates
- Denied requests by reason
- Requests by scope and strategy

**Extended Rate Limiting**
- Extended check with metrics and warnings
- Rate limit actions (allow, deny, throttle, queue)
- Bucket information and usage tracking
- Health status monitoring
- Comprehensive diagnostics with trace IDs

**Rule-Based Rate Limiting**
- Configurable rate limit rules
- Rule priority and scope matching
- Pattern-based rule application
- Dynamic rule management (add/remove)

**Exception Handling**
- Rate limit exceptions for whitelisted identifiers
- Temporary and permanent exceptions
- Expiration-based exception cleanup
- Exception checking before rate limit application

**Tiered Rate Limits**
- Multiple rate limit tiers
- Tier-based configuration overrides
- Priority-based tier selection
- Feature flags per tier

**Quota Management**
- Per-identifier quota tracking
- Quota usage monitoring
- Quota reset and management
- Window-based quota enforcement

**Warning System**
- Configurable warning levels (low, medium, high)
- Warning accumulation and clearing
- Warning integration with rate limit results
- Timestamp-based warning tracking

**Health Monitoring**
- Health status checks (healthy, degraded, unhealthy)
- Health score calculation
- Bucket count monitoring
- Memory usage tracking
- Rate limiter enabled status

**Diagnostics**
- Trace ID generation for request tracking
- Step-by-step diagnostic execution
- Configuration validation
- Bucket state inspection
- Statistics verification

**Configuration**
- Configurable requests per window
- Configurable window size in milliseconds
- Configurable burst size
- Runtime configuration updates
- Skip successful/failed requests
- Grace period configuration
- Priority queue configuration

### Isolation Strategy
- Rate Limiting Layer depends only on Security Layer types
- Does not depend on any higher layers
- Exports only interfaces to Validation Layer
- Implementation details hidden behind interface

## Consequences

### Positive
- Flexible rate limiting strategies (token bucket, sliding window, fixed window, leaky bucket)
- Multiple identifier types supported with various scopes
- Token bucket handles burst traffic well
- Comprehensive statistics tracking with detailed metrics
- Configurable limits with runtime updates
- Rule-based rate limiting for advanced use cases
- Exception handling for whitelisted identifiers
- Tiered rate limits for different user tiers
- Quota management for resource allocation
- Health monitoring and diagnostics
- Warning system for proactive alerts
- Extended rate limit results with metrics
- Bucket cleanup for memory management
- Usage tracking across all identifiers

### Negative
- Token bucket may allow short bursts
- Memory overhead from bucket storage
- Additional latency from rate limit checks
- Complexity from multiple strategies
- Increased complexity from rules, exceptions, and tiers
- Memory overhead from storing rules, exceptions, tiers, and quotas
- Additional latency from health checks and diagnostics
- Complexity from multiple configuration options

### Alternatives Considered
1. **Use external rate limiter (Redis)**: Rejected for simplicity and control
2. **Fixed window only**: Rejected for burst handling
3. **No burst capacity**: Rejected for user experience
4. **Single identifier type**: Rejected for flexibility

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
- ADR 003 - Security Layer Architecture
