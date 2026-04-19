/**
 * Compensation Strategy Unit Tests
 * 
 * Tests for CompensationStrategy implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { CompensationStrategy } from '../implementations/CompensationStrategy';
import { Logger } from '../implementations/Logger';
import { CompensationContext } from '../interfaces/ICompensationStrategy';
import { SagaStep } from '../types/saga-types';

describe('CompensationStrategy', () => {
  let strategy: CompensationStrategy;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    strategy = new CompensationStrategy(logger, true);
  });

  describe('constructor', () => {
    it('should initialize with continueOnError true', () => {
      const newStrategy = new CompensationStrategy(logger, true);
      expect(newStrategy.getStrategyName()).toBe('ReverseOrderCompensation');
    });

    it('should initialize with continueOnError false', () => {
      const newStrategy = new CompensationStrategy(logger, false);
      expect(newStrategy.getStrategyName()).toBe('ReverseOrderCompensation');
    });
  });

  describe('getStrategyName', () => {
    it('should return strategy name', () => {
      expect(strategy.getStrategyName()).toBe('ReverseOrderCompensation');
    });
  });

  describe('compensateStep', () => {
    it('should compensate step successfully', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const context: CompensationContext<string> = {
        step,
        data: 'result',
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await strategy.compensateStep(context);

      expect(result.success).toBe(true);
      expect(result.stepName).toBe('step1');
      expect(step.compensate).toHaveBeenCalledWith('result');
    });

    it('should handle compensation error', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockRejectedValue(new Error('Compensation failed')),
      };

      const context: CompensationContext<string> = {
        step,
        data: 'result',
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await strategy.compensateStep(context);

      expect(result.success).toBe(false);
      expect(result.stepName).toBe('step1');
      expect(result.error).toBe('Compensation failed');
    });

    it('should handle unknown error', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockRejectedValue('string error'),
      };

      const context: CompensationContext<string> = {
        step,
        data: 'result',
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await strategy.compensateStep(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown compensation error');
    });
  });

  describe('compensateSteps', () => {
    it('should compensate all steps successfully', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const contexts: CompensationContext<string>[] = [
        { step: step2, data: 'result2', stepIndex: 1, totalSteps: 2 },
        { step: step1, data: 'result1', stepIndex: 0, totalSteps: 2 },
      ];

      const results = await strategy.compensateSteps(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(step2.compensate).toHaveBeenCalledWith('result2');
      expect(step1.compensate).toHaveBeenCalledWith('result1');
    });

    it('should continue on error when continueOnError is true', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockRejectedValue(new Error('Failed')),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const contexts: CompensationContext<string>[] = [
        { step: step2, data: 'result2', stepIndex: 1, totalSteps: 2 },
        { step: step1, data: 'result1', stepIndex: 0, totalSteps: 2 },
      ];

      const results = await strategy.compensateSteps(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should stop on error when continueOnError is false', async () => {
      const stopStrategy = new CompensationStrategy(logger, false);

      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockRejectedValue(new Error('Failed')),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const contexts: CompensationContext<string>[] = [
        { step: step2, data: 'result2', stepIndex: 1, totalSteps: 2 },
        { step: step1, data: 'result1', stepIndex: 0, totalSteps: 2 },
      ];

      const results = await stopStrategy.compensateSteps(contexts);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should handle empty contexts array', async () => {
      const results = await strategy.compensateSteps([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('shouldContinueOnError', () => {
    it('should return true when continueOnError is true', () => {
      const continueStrategy = new CompensationStrategy(logger, true);
      const context: CompensationContext<string> = {
        step: { name: 'step1', execute: jest.fn(), compensate: jest.fn() },
        data: 'data',
        stepIndex: 0,
        totalSteps: 1,
      };

      expect(continueStrategy.shouldContinueOnError(new Error('test'), context)).toBe(true);
    });

    it('should return false when continueOnError is false', () => {
      const stopStrategy = new CompensationStrategy(logger, false);
      const context: CompensationContext<string> = {
        step: { name: 'step1', execute: jest.fn(), compensate: jest.fn() },
        data: 'data',
        stepIndex: 0,
        totalSteps: 1,
      };

      expect(stopStrategy.shouldContinueOnError(new Error('test'), context)).toBe(false);
    });
  });
});
