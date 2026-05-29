/**
 * Circuit State Entity
 * 
 * Represents the current state of a circuit breaker with metadata.
 * Immutable entity that tracks state transitions and timing.
 */

import { StateTransition, StateMetadata } from '../value-objects/index';

export class CircuitStateEntity {
  readonly currentState: string;
  readonly previousState: string;
  readonly transitions: StateTransition[];
  readonly metadata: StateMetadata;
  private readonly _maxHistorySize: number;

  constructor(
    currentState: string = 'CLOSED',
    previousState: string = 'CLOSED',
    transitions: StateTransition[] = [],
    metadata?: StateMetadata,
    maxHistorySize: number = 100,
  ) {
    this.currentState = currentState;
    this.previousState = previousState;
    this.transitions = transitions.slice(-maxHistorySize);
    this.metadata = metadata || this._createDefaultMetadata();
    this._maxHistorySize = maxHistorySize;
  }

  /**
   * Check if circuit is currently closed (normal operation)
   */
  isClosed(): boolean {
    return this.currentState === 'CLOSED';
  }

  /**
   * Check if circuit is currently open (failing)
   */
  isOpen(): boolean {
    return this.currentState === 'OPEN';
  }

  /**
   * Check if circuit is currently half-open (testing recovery)
   */
  isHalfOpen(): boolean {
    return this.currentState === 'HALF_OPEN';
  }

  /**
   * Get time since last state change
   */
  getTimeSinceLastChange(currentTime: number = Date.now()): number {
    return currentTime - this.metadata.lastStateChangedAt;
  }

  /**
   * Get number of state transitions
   */
  getTransitionCount(): number {
    return this.transitions.length;
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState: string, reason?: string): CircuitStateEntity {
    const transition: StateTransition = {
      from: this.currentState,
      to: newState,
      timestamp: Date.now(),
      reason: reason || `Transition from ${this.currentState} to ${newState}`,
    };

    const newTransitions = [...this.transitions, transition].slice(-this._maxHistorySize);

    const newMetadata: StateMetadata = {
      ...this.metadata,
      lastStateChangedAt: Date.now(),
      totalTransitions: this.metadata.totalTransitions + 1,
      currentStateDuration: 0,
    };

    return new CircuitStateEntity(
      newState,
      this.currentState,
      newTransitions,
      newMetadata,
      this._maxHistorySize,
    );
  }

  /**
   * Create a copy of this entity
   */
  clone(): CircuitStateEntity {
    return new CircuitStateEntity(
      this.currentState,
      this.previousState,
      [...this.transitions],
      { ...this.metadata },
      this._maxHistorySize,
    );
  }

  /**
   * Update metadata
   */
  updateMetadata(updates: Partial<StateMetadata>): CircuitStateEntity {
    return new CircuitStateEntity(
      this.currentState,
      this.previousState,
      [...this.transitions],
      { ...this.metadata, ...updates },
      this._maxHistorySize,
    );
  }

  private _createDefaultMetadata(): StateMetadata {
    return {
      lastStateChangedAt: Date.now(),
      totalTransitions: 0,
      currentStateDuration: 0,
      createdAt: Date.now(),
    };
  }
}
