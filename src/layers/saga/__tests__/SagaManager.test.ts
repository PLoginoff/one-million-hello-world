/**
 * Saga Manager Unit Tests
 * 
 * Tests for SagaManager implementation.
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
      expect(steps[0].compensate).toHaveBeenCalledWith('result1');
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
  });
});
