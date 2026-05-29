/**
 * Step State Machine
 *
 * State machine for managing individual step states.
 * Provides state transitions for saga steps.
 */

export type StepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';

export interface StepStateTransition {
  from: StepState;
  to: StepState;
  condition?: (context: unknown) => boolean;
  action?: (context: unknown) => unknown;
}

export class StepStateMachine {
  private readonly _transitions: Map<string, StepStateTransition[]>;
  private _currentState: StepState;
  private _context: unknown;
  private readonly _stepId: string;

  constructor(stepId: string, initialState: StepState = 'pending', context: unknown = {}) {
    this._stepId = stepId;
    this._currentState = initialState;
    this._context = context;
    this._transitions = new Map();
    this._initializeTransitions();
  }

  /**
   * Get step ID
   */
  getStepId(): string {
    return this._stepId;
  }

  /**
   * Get current state
   */
  getCurrentState(): StepState {
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
  transition(newState: StepState, context?: unknown): boolean {
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
  canTransition(newState: StepState, context?: unknown): boolean {
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
  getValidNextStates(context?: unknown): StepState[] {
    const validTransitions = this._transitions.get(this._currentState) || [];
    return validTransitions
      .filter(t => !t.condition || t.condition(context || this._context))
      .map(t => t.to);
  }

  /**
   * Check if step is terminal
   */
  isTerminal(): boolean {
    return this._currentState === 'completed' || this._currentState === 'failed' || this._currentState === 'skipped';
  }

  /**
   * Check if step is active
   */
  isActive(): boolean {
    return this._currentState === 'running' || this._currentState === 'retrying';
  }

  /**
   * Check if step is retryable
   */
  isRetryable(): boolean {
    return this._currentState === 'failed';
  }

  /**
   * Add custom transition
   */
  addTransition(transition: StepStateTransition): void {
    const transitions = this._transitions.get(transition.from) || [];
    transitions.push(transition);
    this._transitions.set(transition.from, transitions);
  }

  /**
   * Remove transition
   */
  removeTransition(from: StepState, to: StepState): void {
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
      { from: 'pending', to: 'skipped' },
    ]);

    this._transitions.set('running', [
      { from: 'running', to: 'completed' },
      { from: 'running', to: 'failed' },
      { from: 'running', to: 'retrying' },
    ]);

    this._transitions.set('completed', []);

    this._transitions.set('failed', [
      { from: 'failed', to: 'retrying' },
      { from: 'failed', to: 'skipped' },
    ]);

    this._transitions.set('skipped', []);

    this._transitions.set('retrying', [
      { from: 'retrying', to: 'running' },
      { from: 'retrying', to: 'failed' },
      { from: 'retrying', to: 'skipped' },
    ]);
  }
}
