/**
 * Saga State Machine
 *
 * State machine for managing saga execution states and transitions.
 * Provides a formal state transition model for saga lifecycle.
 */

export type SagaState = 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated';

export interface StateTransition {
  from: SagaState;
  to: SagaState;
  condition?: (context: unknown) => boolean;
  action?: (context: unknown) => unknown;
}

export class SagaStateMachine {
  private readonly _transitions: Map<string, StateTransition[]>;
  private _currentState: SagaState;
  private _context: unknown;

  constructor(initialState: SagaState = 'pending', context: unknown = {}) {
    this._currentState = initialState;
    this._context = context;
    this._transitions = new Map();
    this._initializeTransitions();
  }

  /**
   * Get current state
   */
  getCurrentState(): SagaState {
    return this._currentState;
  }

  /**
   * Get context
   */
  getContext(): unknown {
    return this._context;
  }

  /**
   * Transition to new state
   */
  transition(newState: SagaState, context?: unknown): boolean {
    const validTransitions = this._transitions.get(this._currentState) || [];
    const transition = validTransitions.find(t => t.to === newState);

    if (!transition) {
      return false;
    }

    if (transition.condition && !transition.condition(context || this._context)) {
      return false;
    }

    if (transition.action) {
      transition.action(context || this._context);
    }

    return true;
  }

  /**
   * Check if transition is valid
   */
  canTransition(newState: SagaState, context?: unknown): boolean {
    const validTransitions = this._transitions.get(this._currentState) || [];
    const transition = validTransitions.find(t => t.to === newState);

    if (!transition) {
      return false;
    }

    if (transition.condition && !transition.condition(context || this._context)) {
      return false;
    }

    return true;
  }

  /**
   * Get valid next states
   */
  getValidNextStates(context?: unknown): SagaState[] {
    const validTransitions = this._transitions.get(this._currentState) || [];
    return validTransitions
      .filter(t => !t.condition || t.condition(context || this._context))
      .map(t => t.to);
  }

  /**
   * Add custom transition
   */
  addTransition(transition: StateTransition): void {
    const transitions = this._transitions.get(transition.from) || [];
    transitions.push(transition);
    this._transitions.set(transition.from, transitions);
  }

  /**
   * Remove transition
   */
  removeTransition(from: SagaState, to: SagaState): void {
    const transitions = this._transitions.get(from) || [];
    const filtered = transitions.filter(t => t.to !== to);
    this._transitions.set(from, filtered);
  }

  /**
   * Reset to initial state
   */
  reset(context?: unknown): void {
    this._currentState = 'pending';
    if (context) {
      this._context = context;
    }
  }

  private _initializeTransitions(): void {
    this._transitions.set('pending', [
      { from: 'pending', to: 'running' },
    ]);

    this._transitions.set('running', [
      { from: 'running', to: 'completed' },
      { from: 'running', to: 'failed' },
      { from: 'running', to: 'compensating' },
    ]);

    this._transitions.set('completed', []);

    this._transitions.set('failed', [
      { from: 'failed', to: 'compensating' },
    ]);

    this._transitions.set('compensating', [
      { from: 'compensating', to: 'compensated' },
      { from: 'compensating', to: 'failed' },
    ]);

    this._transitions.set('compensated', []);
  }
}
