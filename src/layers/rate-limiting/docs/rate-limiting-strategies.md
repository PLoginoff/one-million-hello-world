# Rate Limiting Strategies

## Overview
The Rate Limiting Layer implements multiple rate limiting strategies to handle different use cases and traffic patterns. Each strategy has its own characteristics and is suitable for specific scenarios.

## Token Bucket Algorithm

### Algorithm Description
The token bucket algorithm is the default strategy. It uses a bucket that fills with tokens at a constant rate. Each request consumes one token. If the bucket is empty, the request is denied.

### Implementation
```typescript
class TokenBucketRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const bucket = this.getOrCreateBucket(identifier);
    const now = Date.now();
    
    // Refill tokens based on time elapsed
    this.refillTokens(bucket, now);
    
    // Check if tokens available
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetTime: new Date(bucket.lastRefill + this.config.windowMs)
      };
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(bucket.lastRefill + this.config.windowMs)
    };
  }
  
  private refillTokens(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.config.windowMs) * this.config.maxRequests;
    
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;
  }
}

interface TokenBucket {
  tokens: number;
  capacity: number;
  lastRefill: number;
}
```

### Characteristics
- **Burst Capacity**: Allows short bursts of traffic up to bucket capacity
- **Smooth Refill**: Tokens refill at constant rate
- **Memory Efficient**: Stores only token count per identifier
- **Suitable For**: APIs with bursty traffic patterns

### Configuration
```typescript
interface TokenBucketConfig {
  capacity: number;        // Maximum tokens in bucket
  refillRate: number;      // Tokens per second
  windowMs: number;        // Window size in milliseconds
}
```

## Sliding Window Algorithm

### Algorithm Description
The sliding window algorithm tracks timestamps of requests within a sliding time window. It provides more accurate rate limiting than fixed window by considering the exact timing of requests.

### Implementation
```typescript
class SlidingWindowRateLimiter {
  private windows: Map<string, number[]> = new Map();
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const timestamps = this.windows.get(identifier) || [];
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Remove timestamps outside the window
    const recentTimestamps = timestamps.filter(t => t > windowStart);
    
    // Check if limit exceeded
    if (recentTimestamps.length >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(recentTimestamps[0] + this.config.windowMs)
      };
    }
    
    // Add current request timestamp
    recentTimestamps.push(now);
    this.windows.set(identifier, recentTimestamps);
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - recentTimestamps.length,
      resetTime: new Date(recentTimestamps[0] + this.config.windowMs)
    };
  }
}
```

### Characteristics
- **Accurate**: Precise rate limiting based on exact timing
- **No Burst**: Does not allow bursts beyond limit
- **Memory Intensive**: Stores timestamps for each request
- **Suitable For**: APIs requiring strict rate limiting

### Configuration
```typescript
interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
}
```

## Fixed Window Algorithm

### Algorithm Description
The fixed window algorithm uses a simple counter that resets at fixed intervals. It's the simplest to implement but may allow double the limit at window boundaries.

### Implementation
```typescript
class FixedWindowRateLimiter {
  private counters: Map<string, FixedWindowCounter> = new Map();
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const counter = this.getOrCreateCounter(identifier);
    const now = Date.now();
    
    // Reset counter if window expired
    if (now > counter.windowEnd) {
      counter.count = 0;
      counter.windowEnd = now + this.config.windowMs;
    }
    
    // Check if limit exceeded
    if (counter.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(counter.windowEnd)
      };
    }
    
    counter.count++;
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - counter.count,
      resetTime: new Date(counter.windowEnd)
    };
  }
}

interface FixedWindowCounter {
  count: number;
  windowEnd: number;
}
```

### Characteristics
- **Simple**: Easy to understand and implement
- **Boundary Issue**: May allow double limit at window boundaries
- **Memory Efficient**: Stores only counter per identifier
- **Suitable For**: Simple rate limiting requirements

### Configuration
```typescript
interface FixedWindowConfig {
  maxRequests: number;
  windowMs: number;
}
```

## Leaky Bucket Algorithm

### Algorithm Description
The leaky bucket algorithm processes requests at a constant rate. Requests that exceed the rate are queued. If the queue is full, requests are denied.

### Implementation
```typescript
class LeakyBucketRateLimiter {
  private buckets: Map<string, LeakyBucket> = new Map();
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const bucket = this.getOrCreateBucket(identifier);
    const now = Date.now();
    
    // Leak requests based on time elapsed
    this.leakRequests(bucket, now);
    
    // Check if queue is full
    if (bucket.queue.length >= this.config.queueSize) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(bucket.lastLeak + this.config.leakInterval)
      };
    }
    
    // Add request to queue
    bucket.queue.push(now);
    
    return {
      allowed: true,
      remaining: this.config.queueSize - bucket.queue.length,
      resetTime: new Date(bucket.lastLeak + this.config.leakInterval)
    };
  }
  
  private leakRequests(bucket: LeakyBucket, now: number): void {
    const elapsed = now - bucket.lastLeak;
    const requestsToLeak = Math.floor(elapsed / this.config.leakInterval);
    
    bucket.queue = bucket.queue.slice(requestsToLeak);
    bucket.lastLeak = now;
  }
}

interface LeakyBucket {
  queue: number[];
  lastLeak: number;
}
```

### Characteristics
- **Smooth Traffic**: Processes requests at constant rate
- **Queue Handling**: Buffers requests for burst handling
- **Memory Intensive**: Stores queue for each identifier
- **Suitable For**: Traffic smoothing and burst handling

### Configuration
```typescript
interface LeakyBucketConfig {
  leakInterval: number;   // Time between request processing
  queueSize: number;      // Maximum queue size
}
```

## Strategy Selection

### Default Strategy
```typescript
enum RateLimitStrategy {
  TOKEN_BUCKET = 'token-bucket',
  SLIDING_WINDOW = 'sliding-window',
  FIXED_WINDOW = 'fixed-window',
  LEAKY_BUCKET = 'leaky-bucket'
}

class RateLimiterFactory {
  createLimiter(strategy: RateLimitStrategy, config: any): IRateLimiter {
    switch (strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        return new TokenBucketRateLimiter(config);
      case RateLimitStrategy.SLIDING_WINDOW:
        return new SlidingWindowRateLimiter(config);
      case RateLimitStrategy.FIXED_WINDOW:
        return new FixedWindowRateLimiter(config);
      case RateLimitStrategy.LEAKY_BUCKET:
        return new LeakyBucketRateLimiter(config);
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }
}
```

### Strategy Comparison

| Strategy | Burst Capacity | Accuracy | Memory | Use Case |
|----------|---------------|-----------|--------|----------|
| Token Bucket | Yes | High | Low | APIs with bursty traffic |
| Sliding Window | No | Very High | High | Strict rate limiting |
| Fixed Window | No | Low | Low | Simple requirements |
| Leaky Bucket | Yes (queued) | Medium | High | Traffic smoothing |

## Burst Protection

### Grace Period
```typescript
interface BurstProtectionConfig {
  gracePeriodMs: number;
  burstLimit: number;
  burstWindowMs: number;
}

class BurstProtection {
  async checkBurst(identifier: string): Promise<boolean> {
    const requests = this.getBurstRequests(identifier);
    const now = Date.now();
    
    // Remove requests outside burst window
    const recentRequests = requests.filter(r => 
      r.timestamp > now - this.config.burstWindowMs
    );
    
    // Check if burst limit exceeded
    if (recentRequests.length >= this.config.burstLimit) {
      return false;
    }
    
    recentRequests.push({ timestamp: now });
    this.setBurstRequests(identifier, recentRequests);
    
    return true;
  }
}
```

### Priority Queuing
```typescript
class PriorityQueueRateLimiter {
  private queue: PriorityQueue<Request>;
  
  async enqueue(request: Request, priority: number): Promise<void> {
    this.queue.enqueue(request, priority);
  }
  
  async process(): Promise<void> {
    while (!this.queue.isEmpty()) {
      const request = this.queue.dequeue();
      await this.processRequest(request);
      await this.delay(this.config.processingInterval);
    }
  }
}
```

## Performance Considerations

### Memory Optimization
- Use efficient data structures for tracking
- Implement bucket cleanup for inactive identifiers
- Limit the number of stored timestamps
- Use object pooling for frequently created objects

### Latency Optimization
- Cache frequently accessed buckets
- Use in-memory storage for fast access
- Minimize lock contention
- Implement async operations where appropriate

## Best Practices

### Strategy Selection Guidelines
- Use token bucket for APIs with bursty traffic
- Use sliding window for strict rate limiting
- Use fixed window for simple requirements
- Use leaky bucket for traffic smoothing

### Configuration Guidelines
- Set appropriate window sizes based on expected traffic
- Configure burst capacity based on SLA requirements
- Monitor rate limit violations and adjust limits
- Implement gradual limit increases for trusted users
