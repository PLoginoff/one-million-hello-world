/**
 * Step Executor Unit Tests
 * 
 * Tests for StepExecutor implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { StepExecutor } from '../implementations/StepExecutor';
import { Logger } from '../implementations/Logger';
import { StepExecutionContext } from '../interfaces/IStepExecutor';
import { SagaStep } from '../types/saga-types';

describe('StepExecutor', () => {
  let executor: StepExecutor;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    executor = new StepExecutor(logger, false);
  });

  describe('constructor', () => {
    it('should initialize with continueOnError false', () => {
      const newExecutor = new StepExecutor(logger, false);
      expect(newExecutor.getExecutorName()).toBe('SequentialStepExecutor');
    });

    it('should initialize with continueOnError true', () => {
      const newExecutor = new StepExecutor(logger, true);
      expect(newExecutor.getExecutorName()).toBe('SequentialStepExecutor');
    });
  });

  describe('getExecutorName', () => {
    it('should return executor name', () => {
      expect(executor.getExecutorName()).toBe('SequentialStepExecutor');
    });
  });

  describe('executeStep', () => {
    it('should execute step successfully', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn(),
      };

      const context: StepExecutionContext<string> = {
        step,
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await executor.executeStep(context);

      expect(result.success).toBe(true);
      expect(result.stepName).toBe('step1');
      expect(result.data).toBe('result');
      expect(result.stepIndex).toBe(0);
      expect(step.execute).toHaveBeenCalled();
    });

    it('should handle execution error', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
        compensate: jest.fn(),
      };

      const context: StepExecutionContext<string> = {
        step,
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await executor.executeStep(context);

      expect(result.success).toBe(false);
      expect(result.stepName).toBe('step1');
      expect(result.error).toBe('Execution failed');
      expect(result.stepIndex).toBe(0);
    });

    it('should handle unknown error', async () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockRejectedValue('string error'),
        compensate: jest.fn(),
      };

      const context: StepExecutionContext<string> = {
        step,
        stepIndex: 0,
        totalSteps: 1,
      };

      const result = await executor.executeStep(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown execution error');
    });
  });

  describe('executeSteps', () => {
    it('should execute all steps successfully', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn(),
      };

      const contexts: StepExecutionContext<string>[] = [
        { step: step1, stepIndex: 0, totalSteps: 2 },
        { step: step2, stepIndex: 1, totalSteps: 2 },
      ];

      const results = await executor.executeSteps(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
    });

    it('should stop on error when continueOnError is false', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('Failed')),
        compensate: jest.fn(),
      };

      const step3: SagaStep<string> = {
        name: 'step3',
        execute: jest.fn().mockResolvedValue('result3'),
        compensate: jest.fn(),
      };

      const contexts: StepExecutionContext<string>[] = [
        { step: step1, stepIndex: 0, totalSteps: 3 },
        { step: step2, stepIndex: 1, totalSteps: 3 },
        { step: step3, stepIndex: 2, totalSteps: 3 },
      ];

      const results = await executor.executeSteps(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
      expect(step3.execute).not.toHaveBeenCalled();
    });

    it('should continue on error when continueOnError is true', async () => {
      const continueExecutor = new StepExecutor(logger, true);

      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('Failed')),
        compensate: jest.fn(),
      };

      const step3: SagaStep<string> = {
        name: 'step3',
        execute: jest.fn().mockResolvedValue('result3'),
        compensate: jest.fn(),
      };

      const contexts: StepExecutionContext<string>[] = [
        { step: step1, stepIndex: 0, totalSteps: 3 },
        { step: step2, stepIndex: 1, totalSteps: 3 },
        { step: step3, stepIndex: 2, totalSteps: 3 },
      ];

      const results = await continueExecutor.executeSteps(contexts);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
      expect(step3.execute).toHaveBeenCalled();
    });

    it('should handle empty contexts array', async () => {
      const results = await executor.executeSteps([]);
      expect(results).toHaveLength(0);
    });

    it('should preserve step order', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn(),
      };

      const contexts: StepExecutionContext<string>[] = [
        { step: step1, stepIndex: 0, totalSteps: 2 },
        { step: step2, stepIndex: 1, totalSteps: 2 },
      ];

      const results = await executor.executeSteps(contexts);

      expect(results[0].stepName).toBe('step1');
      expect(results[1].stepName).toBe('step2');
    });
  });

  describe('shouldContinueOnError', () => {
    it('should return false when continueOnError is false', () => {
      const context: StepExecutionContext<string> = {
        step: { name: 'step1', execute: jest.fn(), compensate: jest.fn() },
        stepIndex: 0,
        totalSteps: 1,
      };

      expect(executor.shouldContinueOnError(new Error('test'), context)).toBe(false);
    });

    it('should return true when continueOnError is true', () => {
      const continueExecutor = new StepExecutor(logger, true);
      const context: StepExecutionContext<string> = {
        step: { name: 'step1', execute: jest.fn(), compensate: jest.fn() },
        stepIndex: 0,
        totalSteps: 1,
      };

      expect(continueExecutor.shouldContinueOnError(new Error('test'), context)).toBe(true);
    });
  });
});
