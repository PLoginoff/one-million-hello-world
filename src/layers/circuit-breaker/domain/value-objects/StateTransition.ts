/**
 * State Transition Value Object
 * 
 * Represents a single state transition with metadata.
 * Immutable value object for tracking circuit state changes.
 */

export interface StateTransition {
  from: string;
  to: string;
  timestamp: number;
  reason: string;
}

export interface StateMetadata {
  lastStateChangedAt: number;
  totalTransitions: number;
  currentStateDuration: number;
  createdAt: number;
}

export class StateTransitionBuilder {
  private _transition: Partial<StateTransition> = {};

  withFrom(from: string): StateTransitionBuilder {
    this._transition.from = from;
    return this;
  }

  withTo(to: string): StateTransitionBuilder {
    this._transition.to = to;
    return this;
  }

  withTimestamp(timestamp: number): StateTransitionBuilder {
    this._transition.timestamp = timestamp;
    return this;
  }

  withReason(reason: string): StateTransitionBuilder {
    this._transition.reason = reason;
    return this;
  }

  build(): StateTransition {
    if (!this._transition.from || !this._transition.to || !this._transition.reason) {
      throw new Error('State transition requires from, to, and reason');
    }

    return {
      from: this._transition.from,
      to: this._transition.to,
      timestamp: this._transition.timestamp || Date.now(),
      reason: this._transition.reason,
    };
  }
}
