/**
 * Saga State Unit Tests
 * 
 * Tests for SagaState implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SagaState } from '../implementations/SagaState';
import { Logger } from '../implementations/Logger';
import { SagaStatus } from '../interfaces/ISagaState';

describe('SagaState', () => {
  let state: SagaState;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    state = new SagaState(logger);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      expect(state.getExecutedSteps()).toEqual([]);
      expect(state.getCompensatedSteps()).toEqual([]);
      expect(state.getCurrentStepIndex()).toBe(0);
      expect(state.getTotalSteps()).toBe(0);
      expect(state.getError()).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      state.setStatus(SagaStatus.RUNNING);
      expect(state.getStatus()).toBe(SagaStatus.RUNNING);
    });
  });

  describe('setStatus', () => {
    it('should set status to RUNNING', () => {
      state.setStatus(SagaStatus.RUNNING);
      expect(state.getStatus()).toBe(SagaStatus.RUNNING);
    });

    it('should set status to COMPLETED', () => {
      state.setStatus(SagaStatus.COMPLETED);
      expect(state.getStatus()).toBe(SagaStatus.COMPLETED);
    });

    it('should set status to COMPENSATING', () => {
      state.setStatus(SagaStatus.COMPENSATING);
      expect(state.getStatus()).toBe(SagaStatus.COMPENSATING);
    });

    it('should set status to COMPENSATED', () => {
      state.setStatus(SagaStatus.COMPENSATED);
      expect(state.getStatus()).toBe(SagaStatus.COMPENSATED);
    });

    it('should set status to FAILED', () => {
      state.setStatus(SagaStatus.FAILED);
      expect(state.getStatus()).toBe(SagaStatus.FAILED);
    });
  });

  describe('addExecutedStep', () => {
    it('should add executed step', () => {
      state.addExecutedStep('step1');
      expect(state.getExecutedSteps()).toEqual(['step1']);
    });

    it('should add multiple executed steps', () => {
      state.addExecutedStep('step1');
      state.addExecutedStep('step2');
      state.addExecutedStep('step3');
      expect(state.getExecutedSteps()).toEqual(['step1', 'step2', 'step3']);
    });
  });

  describe('getExecutedSteps', () => {
    it('should return copy of executed steps', () => {
      state.addExecutedStep('step1');
      const steps = state.getExecutedSteps();
      steps.push('step2');
      expect(state.getExecutedSteps()).toEqual(['step1']);
    });

    it('should return empty array initially', () => {
      expect(state.getExecutedSteps()).toEqual([]);
    });
  });

  describe('addCompensatedStep', () => {
    it('should add compensated step', () => {
      state.addCompensatedStep('step1');
      expect(state.getCompensatedSteps()).toEqual(['step1']);
    });

    it('should add multiple compensated steps', () => {
      state.addCompensatedStep('step1');
      state.addCompensatedStep('step2');
      state.addCompensatedStep('step3');
      expect(state.getCompensatedSteps()).toEqual(['step1', 'step2', 'step3']);
    });
  });

  describe('getCompensatedSteps', () => {
    it('should return copy of compensated steps', () => {
      state.addCompensatedStep('step1');
      const steps = state.getCompensatedSteps();
      steps.push('step2');
      expect(state.getCompensatedSteps()).toEqual(['step1']);
    });

    it('should return empty array initially', () => {
      expect(state.getCompensatedSteps()).toEqual([]);
    });
  });

  describe('setCurrentStepIndex', () => {
    it('should set current step index', () => {
      state.setCurrentStepIndex(5);
      expect(state.getCurrentStepIndex()).toBe(5);
    });

    it('should set index to 0', () => {
      state.setCurrentStepIndex(0);
      expect(state.getCurrentStepIndex()).toBe(0);
    });
  });

  describe('getCurrentStepIndex', () => {
    it('should return current step index', () => {
      state.setCurrentStepIndex(10);
      expect(state.getCurrentStepIndex()).toBe(10);
    });

    it('should return 0 initially', () => {
      expect(state.getCurrentStepIndex()).toBe(0);
    });
  });

  describe('setTotalSteps', () => {
    it('should set total steps', () => {
      state.setTotalSteps(5);
      expect(state.getTotalSteps()).toBe(5);
    });

    it('should set total steps to 0', () => {
      state.setTotalSteps(0);
      expect(state.getTotalSteps()).toBe(0);
    });
  });

  describe('getTotalSteps', () => {
    it('should return total steps', () => {
      state.setTotalSteps(10);
      expect(state.getTotalSteps()).toBe(10);
    });

    it('should return 0 initially', () => {
      expect(state.getTotalSteps()).toBe(0);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      state.setError('Test error');
      expect(state.getError()).toBe('Test error');
    });

    it('should set empty error', () => {
      state.setError('');
      expect(state.getError()).toBe('');
    });
  });

  describe('getError', () => {
    it('should return error message', () => {
      state.setError('Error message');
      expect(state.getError()).toBe('Error message');
    });

    it('should return undefined initially', () => {
      expect(state.getError()).toBeUndefined();
    });
  });

  describe('clearError', () => {
    it('should clear error message', () => {
      state.setError('Error');
      state.clearError();
      expect(state.getError()).toBeUndefined();
    });

    it('should handle clearing when no error', () => {
      state.clearError();
      expect(state.getError()).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      state.setStatus(SagaStatus.RUNNING);
      state.addExecutedStep('step1');
      state.addCompensatedStep('step2');
      state.setCurrentStepIndex(5);
      state.setTotalSteps(10);
      state.setError('Error');

      state.reset();

      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      expect(state.getExecutedSteps()).toEqual([]);
      expect(state.getCompensatedSteps()).toEqual([]);
      expect(state.getCurrentStepIndex()).toBe(0);
      expect(state.getTotalSteps()).toBe(0);
      expect(state.getError()).toBeUndefined();
    });

    it('should handle reset on fresh state', () => {
      state.reset();
      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      expect(state.getExecutedSteps()).toEqual([]);
      expect(state.getCompensatedSteps()).toEqual([]);
      expect(state.getCurrentStepIndex()).toBe(0);
      expect(state.getTotalSteps()).toBe(0);
      expect(state.getError()).toBeUndefined();
    });
  });

  describe('createSnapshot', () => {
    it('should create snapshot with current state', () => {
      state.setStatus(SagaStatus.RUNNING);
      state.addExecutedStep('step1');
      state.addCompensatedStep('step2');
      state.setCurrentStepIndex(2);
      state.setTotalSteps(5);
      state.setError('Error');

      const snapshot = state.createSnapshot();

      expect(snapshot.status).toBe(SagaStatus.RUNNING);
      expect(snapshot.executedSteps).toEqual(['step1']);
      expect(snapshot.compensatedSteps).toEqual(['step2']);
      expect(snapshot.currentStepIndex).toBe(2);
      expect(snapshot.totalSteps).toBe(5);
      expect(snapshot.error).toBe('Error');
      expect(snapshot.timestamp).toBeDefined();
    });

    it('should create snapshot with initial state', () => {
      const snapshot = state.createSnapshot();

      expect(snapshot.status).toBe(SagaStatus.PENDING);
      expect(snapshot.executedSteps).toEqual([]);
      expect(snapshot.compensatedSteps).toEqual([]);
      expect(snapshot.currentStepIndex).toBe(0);
      expect(snapshot.totalSteps).toBe(0);
      expect(snapshot.error).toBeUndefined();
      expect(snapshot.timestamp).toBeDefined();
    });
  });

  describe('restoreFromSnapshot', () => {
    it('should restore state from snapshot', () => {
      const snapshot = {
        status: SagaStatus.COMPLETED,
        executedSteps: ['step1', 'step2'],
        compensatedSteps: ['step3'],
        currentStepIndex: 3,
        totalSteps: 5,
        error: 'Restored error',
        timestamp: Date.now(),
      };

      state.restoreFromSnapshot(snapshot);

      expect(state.getStatus()).toBe(SagaStatus.COMPLETED);
      expect(state.getExecutedSteps()).toEqual(['step1', 'step2']);
      expect(state.getCompensatedSteps()).toEqual(['step3']);
      expect(state.getCurrentStepIndex()).toBe(3);
      expect(state.getTotalSteps()).toBe(5);
      expect(state.getError()).toBe('Restored error');
    });

    it('should restore empty snapshot', () => {
      const snapshot = {
        status: SagaStatus.PENDING,
        executedSteps: [],
        compensatedSteps: [],
        currentStepIndex: 0,
        totalSteps: 0,
        error: undefined,
        timestamp: Date.now(),
      };

      state.setStatus(SagaStatus.RUNNING);
      state.addExecutedStep('step1');

      state.restoreFromSnapshot(snapshot);

      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      expect(state.getExecutedSteps()).toEqual([]);
      expect(state.getCompensatedSteps()).toEqual([]);
      expect(state.getCurrentStepIndex()).toBe(0);
      expect(state.getTotalSteps()).toBe(0);
      expect(state.getError()).toBeUndefined();
    });

    it('should handle snapshot without error', () => {
      const snapshot = {
        status: SagaStatus.FAILED,
        executedSteps: ['step1'],
        compensatedSteps: [],
        currentStepIndex: 1,
        totalSteps: 2,
        timestamp: Date.now(),
      };

      state.restoreFromSnapshot(snapshot);

      expect(state.getStatus()).toBe(SagaStatus.FAILED);
      expect(state.getError()).toBeUndefined();
    });
  });

  describe('state transitions', () => {
    it('should handle PENDING -> RUNNING transition', () => {
      expect(state.getStatus()).toBe(SagaStatus.PENDING);
      state.setStatus(SagaStatus.RUNNING);
      expect(state.getStatus()).toBe(SagaStatus.RUNNING);
    });

    it('should handle RUNNING -> COMPLETED transition', () => {
      state.setStatus(SagaStatus.RUNNING);
      state.setStatus(SagaStatus.COMPLETED);
      expect(state.getStatus()).toBe(SagaStatus.COMPLETED);
    });

    it('should handle RUNNING -> COMPENSATING transition', () => {
      state.setStatus(SagaStatus.RUNNING);
      state.setStatus(SagaStatus.COMPENSATING);
      expect(state.getStatus()).toBe(SagaStatus.COMPENSATING);
    });

    it('should handle COMPENSATING -> COMPENSATED transition', () => {
      state.setStatus(SagaStatus.COMPENSATING);
      state.setStatus(SagaStatus.COMPENSATED);
      expect(state.getStatus()).toBe(SagaStatus.COMPENSATED);
    });

    it('should handle any status -> FAILED transition', () => {
      state.setStatus(SagaStatus.RUNNING);
      state.setStatus(SagaStatus.FAILED);
      expect(state.getStatus()).toBe(SagaStatus.FAILED);
    });
  });
});
