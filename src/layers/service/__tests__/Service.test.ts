/**
 * Service Unit Tests
 * 
 * Tests for Service implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Service } from '../implementations/Service';
import { ServiceContext } from '../types/service-types';

describe('Service', () => {
  let service: Service;

  beforeEach(() => {
    service = new Service();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.enableCaching).toBe(false);
      expect(config.enableRetry).toBe(false);
      expect(config.maxRetries).toBe(3);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableCaching: true,
        cacheTimeout: 30000,
        enableRetry: true,
        maxRetries: 5,
      };

      service.setConfig(newConfig);
      const config = service.getConfig();

      expect(config.enableCaching).toBe(true);
      expect(config.enableRetry).toBe(true);
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('createContext', () => {
    it('should create context with all fields', () => {
      const context = service.createContext('user-123', 'corr-456', 'req-789');

      expect(context.userId).toBe('user-123');
      expect(context.correlationId).toBe('corr-456');
      expect(context.requestId).toBe('req-789');
      expect(context.timestamp).toBeDefined();
    });

    it('should create context without user ID', () => {
      const context = service.createContext(undefined, 'corr-456', 'req-789');

      expect(context.userId).toBeUndefined();
      expect(context.correlationId).toBe('corr-456');
    });
  });

  describe('registerUseCase', () => {
    it('should register use case', () => {
      const useCase = {
        name: 'test-use-case',
        execute: async () => ({ success: true, data: 'result' }),
      };

      service.registerUseCase(useCase);
      const retrieved = service.getUseCase('test-use-case');

      expect(retrieved).toBe(useCase);
    });
  });

  describe('getUseCase', () => {
    it('should return undefined for unregistered use case', () => {
      const retrieved = service.getUseCase('nonexistent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should execute registered use case successfully', async () => {
      const useCase = {
        name: 'test-use-case',
        execute: async () => ({ success: true, data: 'result' }),
      };

      service.registerUseCase(useCase);
      const context = service.createContext('user-123', 'corr-456', 'req-789');

      const result = await service.execute('test-use-case', {}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
    });

    it('should return error for unregistered use case', async () => {
      const context = service.createContext('user-123', 'corr-456', 'req-789');

      const result = await service.execute('nonexistent', {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('USE_CASE_NOT_FOUND');
    });

    it('should handle use case execution errors', async () => {
      const useCase = {
        name: 'failing-use-case',
        execute: async () => {
          throw new Error('Execution failed');
        },
      };

      service.registerUseCase(useCase);
      const context = service.createContext('user-123', 'corr-456', 'req-789');

      const result = await service.execute('failing-use-case', {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Execution failed');
    });
  });

  describe('clearUseCases', () => {
    it('should clear all registered use cases', () => {
      const useCase = {
        name: 'test-use-case',
        execute: async () => ({ success: true, data: 'result' }),
      };

      service.registerUseCase(useCase);
      service.clearUseCases();

      const retrieved = service.getUseCase('test-use-case');

      expect(retrieved).toBeUndefined();
    });
  });
});
