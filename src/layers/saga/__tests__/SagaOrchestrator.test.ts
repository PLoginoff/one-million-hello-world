/**
 * Saga Orchestrator Unit Tests
 * 
 * Tests for SagaOrchestrator implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SagaOrchestrator } from '../implementations/SagaOrchestrator';
import { StepExecutor } from '../implementations/StepExecutor';
import { CompensationOrchestrator } from '../implementations/CompensationOrchestrator';
import { ErrorHandler } from '../implementations/ErrorHandler';
import { SagaState } from '../implementations/SagaState';
import { Logger } from '../implementations/Logger';
import { SagaStep } from '../types/saga-types';
import { OrchestratorConfig } from '../interfaces/ISagaOrchestrator';
import { CompensationStrategy } from '../implementations/CompensationStrategy';

describe('SagaOrchestrator', () => {
  let orchestrator: SagaOrchestrator;
  let stepExecutor: StepExecutor;
  let compensationOrchestrator: CompensationOrchestrator;
  let errorHandler: ErrorHandler;
  let sagaState: SagaState;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    errorHandler = new ErrorHandler(logger);
    sagaState = new SagaState(logger);
    const compensationStrategy = new CompensationStrategy(logger, true);
    compensationOrchestrator = new CompensationOrchestrator(compensationStrategy, errorHandler, logger);
    stepExecutor = new StepExecutor(logger, false);
    orchestrator = new SagaOrchestrator(stepExecutor, compensationOrchestrator, sagaState, errorHandler, logger);
  });

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(orchestrator).toBeDefined();
    });
  });

  describe('getOrchestratorName', () => {
    it('should return orchestrator name', () => {
      expect(orchestrator.getOrchestratorName()).toBe('DefaultSagaOrchestrator');
    });
  });

  describe('orchestrate', () => {
    it('should execute all steps successfully', async () => {
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

      const steps: SagaStep<string>[] = [step1, step2];
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate(steps, config);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toEqual(['step1', 'step2']);
      expect(result.compensatedSteps).toEqual([]);
      expect(result.error).toBeUndefined();
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
    });

    it('should trigger compensation on failure', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('Failed')),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1, step2];
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate(steps, config);

      expect(result.success).toBe(false);
      expect(result.executedSteps).toEqual(['step1']);
      expect(result.compensatedSteps).toEqual(['step1']);
      expect(result.error).toBeDefined();
      expect(step1.execute).toHaveBeenCalled();
      expect(step2.execute).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should not trigger compensation when disabled', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('Failed')),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1, step2];
      const config: OrchestratorConfig = {
        enableCompensation: false,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate(steps, config);

      expect(result.success).toBe(false);
      expect(result.compensatedSteps).toEqual([]);
      expect(step1.compensate).not.toHaveBeenCalled();
    });

    it('should handle empty steps array', async () => {
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate([], config);

      expect(result.success).toBe(true);
      expect(result.executedSteps).toEqual([]);
      expect(result.compensatedSteps).toEqual([]);
    });

    it('should update saga state during execution', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1];
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      await orchestrator.orchestrate(steps, config);

      expect(sagaState.getStatus()).toBeDefined();
      expect(sagaState.getExecutedSteps()).toEqual(['step1']);
    });

    it('should handle error during compensation', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockRejectedValue(new Error('Compensation failed')),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1, step2];
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate(steps, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

  });

  describe('setConfig', () => {
    it('should set new config', () => {
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: true,
      };

      orchestrator.setConfig(config);

      const result = orchestrator.getConfig();
      expect(result.enableCompensation).toBe(true);
      expect(result.enableLogging).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return default config', () => {
      const config = orchestrator.getConfig();
      expect(config.enableCompensation).toBe(true);
      expect(config.enableLogging).toBe(false);
    });

    it('should return set config', () => {
      const newConfig: OrchestratorConfig = {
        enableCompensation: false,
        enableLogging: true,
      };

      orchestrator.setConfig(newConfig);
      const config = orchestrator.getConfig();

      expect(config.enableCompensation).toBe(false);
      expect(config.enableLogging).toBe(true);
    });
  });

  describe('error handling integration', () => {
    it('should handle and format errors correctly', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockRejectedValue(new Error('Test error')),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1];
      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrate(steps, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Test error');
    });
  });
});
