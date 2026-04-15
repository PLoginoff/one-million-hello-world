/**
 * Router Types Tests
 * 
 * Tests for Router Layer type definitions and enums.
 * Ensures type correctness and enum uniqueness.
 */

import {
  HttpMethod,
  RoutePriority,
  RouteStatus,
  ParameterType,
  MiddlewareOrder,
  CacheStrategy,
  RateLimitScope,
} from '../types/router-types';

describe('RouterTypes', () => {
  describe('HttpMethod', () => {
    it('should have unique HTTP methods', () => {
      const methods = Object.values(HttpMethod);
      const uniqueMethods = new Set(methods);
      expect(methods.length).toBe(uniqueMethods.size);
    });

    it('should contain all expected HTTP methods', () => {
      expect(HttpMethod.GET).toBe('GET');
      expect(HttpMethod.POST).toBe('POST');
      expect(HttpMethod.PUT).toBe('PUT');
      expect(HttpMethod.DELETE).toBe('DELETE');
      expect(HttpMethod.PATCH).toBe('PATCH');
      expect(HttpMethod.HEAD).toBe('HEAD');
      expect(HttpMethod.OPTIONS).toBe('OPTIONS');
      expect(HttpMethod.TRACE).toBe('TRACE');
      expect(HttpMethod.CONNECT).toBe('CONNECT');
    });
  });

  describe('RoutePriority', () => {
    it('should have unique priority levels', () => {
      const priorities = Object.values(RoutePriority);
      const uniquePriorities = new Set(priorities);
      expect(priorities.length).toBe(uniquePriorities.size);
    });

    it('should contain all expected priority levels', () => {
      expect(RoutePriority.LOW).toBe('LOW');
      expect(RoutePriority.MEDIUM).toBe('MEDIUM');
      expect(RoutePriority.HIGH).toBe('HIGH');
      expect(RoutePriority.CRITICAL).toBe('CRITICAL');
    });
  });

  describe('RouteStatus', () => {
    it('should have unique status values', () => {
      const statuses = Object.values(RouteStatus);
      const uniqueStatuses = new Set(statuses);
      expect(statuses.length).toBe(uniqueStatuses.size);
    });

    it('should contain all expected status values', () => {
      expect(RouteStatus.ACTIVE).toBe('ACTIVE');
      expect(RouteStatus.DISABLED).toBe('DISABLED');
      expect(RouteStatus.DEPRECATED).toBe('DEPRECATED');
    });
  });

  describe('ParameterType', () => {
    it('should have unique parameter types', () => {
      const types = Object.values(ParameterType);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('should contain all expected parameter types', () => {
      expect(ParameterType.STRING).toBe('STRING');
      expect(ParameterType.NUMBER).toBe('NUMBER');
      expect(ParameterType.BOOLEAN).toBe('BOOLEAN');
      expect(ParameterType.UUID).toBe('UUID');
      expect(ParameterType.EMAIL).toBe('EMAIL');
      expect(ParameterType.DATE).toBe('DATE');
      expect(ParameterType.JSON).toBe('JSON');
      expect(ParameterType.ARRAY).toBe('ARRAY');
    });
  });

  describe('MiddlewareOrder', () => {
    it('should have unique order values', () => {
      const orders = Object.values(MiddlewareOrder);
      const uniqueOrders = new Set(orders);
      expect(orders.length).toBe(uniqueOrders.size);
    });

    it('should contain all expected order values', () => {
      expect(MiddlewareOrder.BEFORE).toBe('BEFORE');
      expect(MiddlewareOrder.AFTER).toBe('AFTER');
      expect(MiddlewareOrder.BOTH).toBe('BOTH');
    });
  });

  describe('CacheStrategy', () => {
    it('should have unique cache strategies', () => {
      const strategies = Object.values(CacheStrategy);
      const uniqueStrategies = new Set(strategies);
      expect(strategies.length).toBe(uniqueStrategies.size);
    });

    it('should contain all expected cache strategies', () => {
      expect(CacheStrategy.NONE).toBe('NONE');
      expect(CacheStrategy.MEMORY).toBe('MEMORY');
      expect(CacheStrategy.REDIS).toBe('REDIS');
      expect(CacheStrategy.CUSTOM).toBe('CUSTOM');
    });
  });

  describe('RateLimitScope', () => {
    it('should have unique rate limit scopes', () => {
      const scopes = Object.values(RateLimitScope);
      const uniqueScopes = new Set(scopes);
      expect(scopes.length).toBe(uniqueScopes.size);
    });

    it('should contain all expected rate limit scopes', () => {
      expect(RateLimitScope.GLOBAL).toBe('GLOBAL');
      expect(RateLimitScope.ROUTE).toBe('ROUTE');
      expect(RateLimitScope.USER).toBe('USER');
      expect(RateLimitScope.IP).toBe('IP');
    });
  });

  describe('Enum Uniqueness Across All Enums', () => {
    it('should have no duplicate values across all enums', () => {
      const allValues = [
        ...Object.values(HttpMethod),
        ...Object.values(RoutePriority),
        ...Object.values(RouteStatus),
        ...Object.values(ParameterType),
        ...Object.values(MiddlewareOrder),
        ...Object.values(CacheStrategy),
        ...Object.values(RateLimitScope),
      ];

      const uniqueValues = new Set(allValues);
      expect(allValues.length).toBe(uniqueValues.size);
    });
  });
});
