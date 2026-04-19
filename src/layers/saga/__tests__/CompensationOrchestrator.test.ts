/**
 * Compensation Orchestrator Unit Tests
 * 
 * Tests for CompensationOrchestrator implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { CompensationOrchestrator } from '../implementations/CompensationOrchestrator';
import { CompensationStrategy } from '../implementations/CompensationStrategy';
import { ErrorHandler } from '../implementations/ErrorHandler';
import { Logger } from '../implementations/Logger';
import { SagaStep } from '../types/saga-types';
import { SagaState } from '../implementations/SagaState';
import { OrchestratorConfig } from '../interfaces/ISagaOrchestrator';

describe('CompensationOrchestrator', () => {
  let orchestrator: CompensationOrchestrator;
  let compensationStrategy: CompensationStrategy;
  let errorHandler: ErrorHandler;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    errorHandler = new ErrorHandler(logger);
    compensationStrategy = new CompensationStrategy(logger, true);
    orchestrator = new CompensationOrchestrator(compensationStrategy, errorHandler, logger);
  });

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(orchestrator).toBeDefined();
    });
  });

  describe('getOrchestratorName', () => {
    it('should return orchestrator name', () => {
      expect(orchestrator.getOrchestratorName()).toBe('DefaultCompensationOrchestrator');
    });
  });

  describe('orchestrateCompensation', () => {
    it('should compensate all executed steps in reverse order', async () => {
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
      const sagaState = new SagaState(logger);
      sagaState.addExecutedStep('step1');
      sagaState.addExecutedStep('step2');

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(result.success).toBe(true);
      expect(result.compensatedSteps).toEqual(['step2', 'step1']);
      expect(result.failedSteps).toEqual([]);
      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should handle compensation failure', async () => {
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

      const steps: SagaStep<string>[] = [step1, step2];
      const sagaState = new SagaState(logger);
      sagaState.addExecutedStep('step1');
      sagaState.addExecutedStep('step2');

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(result.success).toBe(false);
      expect(result.failedSteps).toContain('step1');
      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should handle empty executed steps', async () => {
      const steps: SagaStep<string>[] = [];
      const sagaState = new SagaState(logger);

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(result.success).toBe(true);
      expect(result.compensatedSteps).toEqual([]);
      expect(result.failedSteps).toEqual([]);
    });

    it('should handle step not found in steps array', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1];
      const sagaState = new SagaState(logger);
      sagaState.addExecutedStep('step1');
      sagaState.addExecutedStep('nonexistent');

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(result.success).toBe(true);
      expect(result.compensatedSteps).toEqual(['step1']);
    });

    it('should update saga state with compensated steps', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const steps: SagaStep<string>[] = [step1];
      const sagaState = new SagaState(logger);
      sagaState.addExecutedStep('step1');

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(sagaState.getCompensatedSteps()).toEqual(['step1']);
    });

    it('should handle multiple compensation failures', async () => {
      const step1: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockRejectedValue(new Error('Failed 1')),
      };

      const step2: SagaStep<string> = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockRejectedValue(new Error('Failed 2')),
      };

      const steps: SagaStep<string>[] = [step1, step2];
      const sagaState = new SagaState(logger);
      sagaState.addExecutedStep('step1');
      sagaState.addExecutedStep('step2');

      const config: OrchestratorConfig = {
        enableCompensation: true,
        enableLogging: false,
      };

      const result = await orchestrator.orchestrateCompensation(steps, sagaState, config);

      expect(result.success).toBe(false);
      expect(result.failedSteps).toHaveLength(2);
      expect(result.error).toBeDefined();
    });
  });
});
