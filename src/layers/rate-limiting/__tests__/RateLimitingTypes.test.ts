/**
 * Rate Limiting Types Unit Tests
 * 
 * Unit tests for Rate Limiting Layer type definitions and enums.
 * Tests enum values and type interfaces.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import {
  RateLimitErrorCode,
  RateLimitEventType,
  RateLimitScope,
  RateLimitAction,
  RateLimitStrategy,
  RateLimitIdentifierType,
} from '../types/rate-limiting-types';

describe('Rate Limiting Types', () => {
  describe('RateLimitErrorCode', () => {
    it('should have all expected error codes', () => {
      expect(RateLimitErrorCode.LIMIT_EXCEEDED).toBe('LIMIT_EXCEEDED');
      expect(RateLimitErrorCode.INVALID_IDENTIFIER).toBe('INVALID_IDENTIFIER');
      expect(RateLimitErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
      expect(RateLimitErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
      expect(RateLimitErrorCode.TIER_EXCEEDED).toBe('TIER_EXCEEDED');
      expect(RateLimitErrorCode.RULE_VIOLATION).toBe('RULE_VIOLATION');
      expect(RateLimitErrorCode.BUCKET_NOT_FOUND).toBe('BUCKET_NOT_FOUND');
      expect(RateLimitErrorCode.STRATEGY_NOT_SUPPORTED).toBe('STRATEGY_NOT_SUPPORTED');
    });

    it('should have 8 error codes', () => {
      const errorCodes = Object.values(RateLimitErrorCode);
      expect(errorCodes).toHaveLength(8);
    });
  });

  describe('RateLimitEventType', () => {
    it('should have all expected event types', () => {
      expect(RateLimitEventType.REQUEST_ALLOWED).toBe('REQUEST_ALLOWED');
      expect(RateLimitEventType.REQUEST_DENIED).toBe('REQUEST_DENIED');
      expect(RateLimitEventType.BUCKET_CREATED).toBe('BUCKET_CREATED');
      expect(RateLimitEventType.BUCKET_RESET).toBe('BUCKET_RESET');
      expect(RateLimitEventType.BUCKET_EXPIRED).toBe('BUCKET_EXPIRED');
      expect(RateLimitEventType.QUOTA_REACHED).toBe('QUOTA_REACHED');
      expect(RateLimitEventType.TIER_UPGRADED).toBe('TIER_UPGRADED');
      expect(RateLimitEventType.TIER_DOWNGRADED).toBe('TIER_DOWNGRADED');
      expect(RateLimitEventType.RULE_ADDED).toBe('RULE_ADDED');
      expect(RateLimitEventType.RULE_REMOVED).toBe('RULE_REMOVED');
    });

    it('should have 10 event types', () => {
      const eventTypes = Object.values(RateLimitEventType);
      expect(eventTypes).toHaveLength(10);
    });
  });

  describe('RateLimitScope', () => {
    it('should have all expected scopes', () => {
      expect(RateLimitScope.GLOBAL).toBe('GLOBAL');
      expect(RateLimitScope.PER_USER).toBe('PER_USER');
      expect(RateLimitScope.PER_API_KEY).toBe('PER_API_KEY');
      expect(RateLimitScope.PER_IP).toBe('PER_IP');
      expect(RateLimitScope.PER_ENDPOINT).toBe('PER_ENDPOINT');
      expect(RateLimitScope.CUSTOM).toBe('CUSTOM');
    });

    it('should have 6 scopes', () => {
      const scopes = Object.values(RateLimitScope);
      expect(scopes).toHaveLength(6);
    });
  });

  describe('RateLimitAction', () => {
    it('should have all expected actions', () => {
      expect(RateLimitAction.ALLOW).toBe('ALLOW');
      expect(RateLimitAction.DENY).toBe('DENY');
      expect(RateLimitAction.THROTTLE).toBe('THROTTLE');
      expect(RateLimitAction.QUEUE).toBe('QUEUE');
    });

    it('should have 4 actions', () => {
      const actions = Object.values(RateLimitAction);
      expect(actions).toHaveLength(4);
    });
  });

  describe('RateLimitStrategy', () => {
    it('should have all expected strategies', () => {
      expect(RateLimitStrategy.TOKEN_BUCKET).toBe('TOKEN_BUCKET');
      expect(RateLimitStrategy.SLIDING_WINDOW).toBe('SLIDING_WINDOW');
      expect(RateLimitStrategy.FIXED_WINDOW).toBe('FIXED_WINDOW');
      expect(RateLimitStrategy.LEAKY_BUCKET).toBe('LEAKY_BUCKET');
    });

    it('should have 4 strategies', () => {
      const strategies = Object.values(RateLimitStrategy);
      expect(strategies).toHaveLength(4);
    });
  });

  describe('RateLimitIdentifierType', () => {
    it('should have all expected identifier types', () => {
      expect(RateLimitIdentifierType.IP_ADDRESS).toBe('IP_ADDRESS');
      expect(RateLimitIdentifierType.USER_ID).toBe('USER_ID');
      expect(RateLimitIdentifierType.API_KEY).toBe('API_KEY');
      expect(RateLimitIdentifierType.CUSTOM).toBe('CUSTOM');
    });

    it('should have 4 identifier types', () => {
      const identifierTypes = Object.values(RateLimitIdentifierType);
      expect(identifierTypes).toHaveLength(4);
    });
  });

  describe('Enum Values Consistency', () => {
    it('should have unique error code values', () => {
      const errorCodes = Object.values(RateLimitErrorCode);
      const uniqueCodes = new Set(errorCodes);
      expect(uniqueCodes.size).toBe(errorCodes.length);
    });

    it('should have unique event type values', () => {
      const eventTypes = Object.values(RateLimitEventType);
      const uniqueTypes = new Set(eventTypes);
      expect(uniqueTypes.size).toBe(eventTypes.length);
    });

    it('should have unique scope values', () => {
      const scopes = Object.values(RateLimitScope);
      const uniqueScopes = new Set(scopes);
      expect(uniqueScopes.size).toBe(scopes.length);
    });

    it('should have unique action values', () => {
      const actions = Object.values(RateLimitAction);
      const uniqueActions = new Set(actions);
      expect(uniqueActions.size).toBe(actions.length);
    });

    it('should have unique strategy values', () => {
      const strategies = Object.values(RateLimitStrategy);
      const uniqueStrategies = new Set(strategies);
      expect(uniqueStrategies.size).toBe(strategies.length);
    });

    it('should have unique identifier type values', () => {
      const identifierTypes = Object.values(RateLimitIdentifierType);
      const uniqueTypes = new Set(identifierTypes);
      expect(uniqueTypes.size).toBe(identifierTypes.length);
    });
  });
});
