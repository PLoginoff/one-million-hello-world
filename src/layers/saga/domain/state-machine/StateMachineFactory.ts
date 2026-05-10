/**
 * State Machine Factory
 *
 * Factory for creating state machines.
 * Provides convenient methods for creating configured state machines.
 */

import { SagaStateMachine, SagaState } from './SagaStateMachine';
import { StepStateMachine, StepState } from './StepStateMachine';

export class StateMachineFactory {
  /**
   * Create saga state machine with initial state
   */
  static createSagaStateMachine(initialState: SagaState = 'pending', context?: unknown): SagaStateMachine {
    return new SagaStateMachine(initialState, context);
  }

  /**
   * Create step state machine
   */
  static createStepStateMachine(stepId: string, initialState: StepState = 'pending', context?: unknown): StepStateMachine {
    return new StepStateMachine(stepId, initialState, context);
  }

  /**
   * Create saga state machine with custom transitions
   */
  static createSagaStateMachineWithTransitions(
    initialState: SagaState,
    transitions: any[],
    context?: unknown,
  ): SagaStateMachine {
    const machine = new SagaStateMachine(initialState, context);
    for (const transition of transitions) {
      machine.addTransition(transition);
    }
    return machine;
  }

  /**
   * Create step state machine with custom transitions
   */
  static createStepStateMachineWithTransitions(
    stepId: string,
    initialState: StepState,
    transitions: any[],
    context?: unknown,
  ): StepStateMachine {
    const machine = new StepStateMachine(stepId, initialState, context);
    for (const transition of transitions) {
      machine.addTransition(transition);
    }
    return machine;
  }

  /**
   * Create saga state machine for compensation
   */
  static createCompensationStateMachine(context?: unknown): SagaStateMachine {
    const machine = new SagaStateMachine('compensating', context);
    machine.addTransition({ from: 'compensating', to: 'compensated' });
    machine.addTransition({ from: 'compensating', to: 'failed' });
    return machine;
  }

  /**
   * Create step state machine for retry
   */
  static createRetryStateMachine(stepId: string, context?: unknown): StepStateMachine {
    const machine = new StepStateMachine(stepId, 'failed', context);
    machine.addTransition({ from: 'failed', to: 'retrying' });
    machine.addTransition({ from: 'retrying', to: 'running' });
    return machine;
  }
}
