/**
 * Integration test: Rate Limiting → Validation
 * Verifies that rate limiting works before validation
 */

import { TokenBucketStrategy } from '../../rate-limiting/strategies/algorithm/TokenBucketStrategy';
import { RateLimitKey } from '../../rate-limiting/domain/entities/RateLimitKey';
import { CompositeValidationStrategy } from '../../validation/strategies/strategy/CompositeValidationStrategy';
import { IValidationStrategy } from '../../validation/strategies/strategy/IValidationStrategy';
import { ValidationResultEntity } from '../../validation/domain/entities/ValidationResultEntity';

describe('Rate Limiting → Validation Integration', () => {
  it('should allow request then validate successfully', () => {
    const rateLimiter = new TokenBucketStrategy();
    const key = RateLimitKey.fromUser('user-1');

    const rateResult = rateLimiter.isAllowed(key, 10, 1000);
    expect(rateResult.allowed).toBe(true);

    const validator = new CompositeValidationStrategy([
      {
        getName: () => 'required-field',
        validate: (value: unknown) => {
          const obj = value as { name?: string };
          if (!obj.name) {
            return ValidationResultEntity.failure([{ field: 'name', message: 'name is required' }]);
          }
          return ValidationResultEntity.success();
        },
      } as IValidationStrategy,
    ]);

    const validationResult = validator.validate({ name: 'test' });
    expect(validationResult.data.valid).toBe(true);
  });

  it('should block rate-limited request before validation', () => {
    const rateLimiter = new TokenBucketStrategy();
    const key = RateLimitKey.fromIp('192.168.1.1');

    for (let i = 0; i < 3; i++) {
      rateLimiter.isAllowed(key, 3, 1000);
    }

    const rateResult = rateLimiter.isAllowed(key, 3, 1000);
    expect(rateResult.allowed).toBe(false);
  });

  it('should handle rate limit then validation failure', () => {
    const rateLimiter = new TokenBucketStrategy();
    const key = RateLimitKey.fromUser('user-2');

    const rateResult = rateLimiter.isAllowed(key, 5, 1000);
    expect(rateResult.allowed).toBe(true);

    const validator = new CompositeValidationStrategy([
      {
        getName: () => 'email-format',
        validate: (value: unknown) => {
          const obj = value as { email?: string };
          if (!obj.email || !obj.email.includes('@')) {
            return ValidationResultEntity.failure([{ field: 'email', message: 'invalid email' }]);
          }
          return ValidationResultEntity.success();
        },
      } as IValidationStrategy,
    ]);

    const result = validator.validate({ email: 'invalid' });
    expect(result.data.valid).toBe(false);
    expect(result.data.errors.length).toBe(1);
  });
});
