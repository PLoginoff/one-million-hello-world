/**
 * Facade Unit Tests
 * 
 * Tests for Facade implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Facade } from '../implementations/Facade';

describe('Facade', () => {
  let facade: Facade;

  beforeEach(() => {
    facade = new Facade();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = facade.getConfig();

      expect(config).toBeDefined();
      expect(config.enableAggregation).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableAggregation: false,
        enableComposition: false,
      };

      facade.setConfig(newConfig);
      const config = facade.getConfig();

      expect(config.enableAggregation).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute all operations successfully', async () => {
      const operations = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
      ];

      const result = await facade.execute(operations);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['result1', 'result2']);
      expect(result.operations).toEqual(['operation_0', 'operation_1']);
    });

    it('should handle operation failure', async () => {
      const operations = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockRejectedValue(new Error('Failed')),
      ];

      const result = await facade.execute(operations);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });

    it('should handle empty operations', async () => {
      const result = await facade.execute([]);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
