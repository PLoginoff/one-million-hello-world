/**
 * Saga Manager Unit Tests
 * 
 * Tests for SagaManager implementation with abstraction layers.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SagaManager } from '../implementations/SagaManager';
import { SagaStep } from '../types/saga-types';

describe('SagaManager', () => {
  let sagaManager: SagaManager;

  beforeEach(() => {
    sagaManager = new SagaManager();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = sagaManager.getConfig();

      expect(config).toBeDefined();
      expect(config.enableCompensation).toBe(true);
      expect(config.enableLogging).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableLogging: true,
        enableCompensation: false,
      };

      sagaManager.setConfig(newConfig);
      const config = sagaManager.getConfig();

      expect(config.enableCompensation).toBe(false);
      expect(config.enableLogging).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute all steps successfully', async () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn(),
        },
      ];

      const result = await sagaManager.execute(steps);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toEqual(['step1', 'step2']);
      expect(steps[0].execute).toHaveBeenCalled();
      expect(steps[1].execute).toHaveBeenCalled();
    });

    it('should compensate on failure', async () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: jest.fn().mockRejectedValue(new Error('Failed')),
          compensate: jest.fn(),
        },
      ];

      const result = await sagaManager.execute(steps);

      expect(result.success).toBe(false);
      expect(result.executedSteps).toEqual(['step1', 'step2']);
      expect(result.compensatedSteps).toEqual(['step1']);
      expect(steps[0].compensate).toHaveBeenCalled();
    });

    it('should skip compensation when disabled', async () => {
      sagaManager.setConfig({ enableLogging: false, enableCompensation: false });
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: jest.fn().mockRejectedValue(new Error('Failed')),
          compensate: jest.fn(),
        },
      ];

      const result = await sagaManager.execute(steps);

      expect(result.success).toBe(false);
      expect(result.compensatedSteps).toEqual([]);
      expect(steps[0].compensate).not.toHaveBeenCalled();
    });

    it('should validate step names for uniqueness', async () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn(),
        },
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn(),
        },
      ];

      const result = await sagaManager.execute(steps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('Duplicate');
    });

    it('should validate step functions exist', async () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: undefined as any,
          compensate: jest.fn(),
        },
      ];

      const result = await sagaManager.execute(steps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });
});
