/**
 * Rate Limiting Strategies Unit Tests
 */

import { TokenBucketStrategy } from '../strategies/algorithm/TokenBucketStrategy';
import { LeakyBucketStrategy } from '../strategies/algorithm/LeakyBucketStrategy';
import { RateLimitKey } from '../domain/entities/RateLimitKey';

describe('TokenBucketStrategy', () => {
  let strategy: TokenBucketStrategy;
  let key: RateLimitKey;

  beforeEach(() => {
    strategy = new TokenBucketStrategy();
    key = RateLimitKey.fromIp('192.168.1.1');
  });

  it('should return name TOKEN_BUCKET', () => {
    expect(strategy.getName()).toBe('TOKEN_BUCKET');
  });

  it('should allow requests within limit', () => {
    const result1 = strategy.isAllowed(key, 5, 1000);
    const result2 = strategy.isAllowed(key, 5, 1000);
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  it('should deny requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) {
      strategy.isAllowed(key, 5, 1000);
    }
    const result = strategy.isAllowed(key, 5, 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should track remaining tokens', () => {
    strategy.isAllowed(key, 5, 1000);
    const status = strategy.getStatus(key);
    expect(status).not.toBeNull();
    expect(status!.remaining).toBeLessThanOrEqual(4);
  });

  it('should return null for unknown key status', () => {
    const status = strategy.getStatus(key);
    expect(status).toBeNull();
  });

  it('should reset key', () => {
    strategy.isAllowed(key, 5, 1000);
    strategy.reset(key);
    const status = strategy.getStatus(key);
    expect(status).toBeNull();
  });

  it('should reset all keys', () => {
    strategy.isAllowed(key, 5, 1000);
    strategy.resetAll();
    expect(strategy.getActiveKeyCount()).toBe(0);
  });

  it('should track active keys', () => {
    strategy.isAllowed(RateLimitKey.fromIp('1.1.1.1'), 5, 1000);
    strategy.isAllowed(RateLimitKey.fromIp('2.2.2.2'), 5, 1000);
    expect(strategy.getActiveKeyCount()).toBe(2);
  });
});

describe('LeakyBucketStrategy', () => {
  let strategy: LeakyBucketStrategy;
  let key: RateLimitKey;

  beforeEach(() => {
    strategy = new LeakyBucketStrategy();
    key = RateLimitKey.fromUser('user-1');
  });

  it('should return name LEAKY_BUCKET', () => {
    expect(strategy.getName()).toBe('LEAKY_BUCKET');
  });

  it('should allow requests within capacity', () => {
    const result = strategy.isAllowed(key, 5, 1000);
    expect(result.allowed).toBe(true);
  });

  it('should deny requests when bucket is full', () => {
    for (let i = 0; i < 5; i++) {
      strategy.isAllowed(key, 5, 1000);
    }
    const result = strategy.isAllowed(key, 5, 1000);
    expect(result.allowed).toBe(false);
  });

  it('should track water level', () => {
    strategy.isAllowed(key, 5, 1000);
    const status = strategy.getStatus(key);
    expect(status).not.toBeNull();
    expect(status!.remaining).toBeDefined();
  });

  it('should return null for unknown key', () => {
    const status = strategy.getStatus(key);
    expect(status).toBeNull();
  });

  it('should reset key', () => {
    strategy.isAllowed(key, 5, 1000);
    strategy.reset(key);
    expect(strategy.getStatus(key)).toBeNull();
  });

  it('should reset all keys', () => {
    strategy.isAllowed(key, 5, 1000);
    strategy.resetAll();
    expect(strategy.getActiveKeyCount()).toBe(0);
  });
});
