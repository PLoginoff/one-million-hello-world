# Circuit States

## Overview
The Circuit Breaker Layer implements circuit states with closed state (normal operation), open state (failures exceed threshold), half-open state (testing recovery), and automatic state transitions.

## State Definition

### Circuit State
```typescript
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

interface StateTransition {
  from: CircuitState;
  to: CircuitState;
  reason: string;
  timestamp: Date;
}
```

### State Manager
```typescript
class CircuitStateManager {
  private state: CircuitState;
  private transitions: StateTransition[];
  
  constructor(initialState: CircuitState = CircuitState.CLOSED) {
    this.state = initialState;
    this.transitions = [];
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  transitionTo(newState: CircuitState, reason: string): void {
    if (!this.canTransition(newState)) {
      throw new Error(`Cannot transition from ${this.state} to ${newState}`);
    }
    
    const transition: StateTransition = {
      from: this.state,
      to: newState,
      reason,
      timestamp: new Date()
    };
    
    this.transitions.push(transition);
    this.state = newState;
  }
  
  private canTransition(newState: CircuitState): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return newState === CircuitState.OPEN;
      case CircuitState.OPEN:
        return newState === CircuitState.HALF_OPEN;
      case CircuitState.HALF_OPEN:
        return newState === CircuitState.CLOSED || newState === CircuitState.OPEN;
      default:
        return false;
    }
  }
  
  getTransitions(): StateTransition[] {
    return [...this.transitions];
  }
  
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.transitions = [];
  }
}
```

## State Machine

### State Machine
```typescript
class CircuitStateMachine {
  private stateManager: CircuitStateManager;
  private failureThreshold: number;
  private successThreshold: number;
  private resetTimeout: number;
  private lastFailureTime: Date | null = null;
  private successCount: number = 0;
  private failureCount: number = 0;
  
  constructor(config: CircuitBreakerConfig) {
    this.stateManager = new CircuitStateManager();
    this.failureThreshold = config.failureThreshold;
    this.successThreshold = config.successThreshold;
    this.resetTimeout = config.resetTimeout;
  }
  
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.failureThreshold && this.stateManager.getState() === CircuitState.CLOSED) {
      this.stateManager.transitionTo(CircuitState.OPEN, 'Failure threshold exceeded');
    }
  }
  
  recordSuccess(): void {
    this.successCount++;
    
    if (this.stateManager.getState() === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.successThreshold) {
        this.stateManager.transitionTo(CircuitState.CLOSED, 'Recovery confirmed');
        this.resetCounters();
      }
    }
  }
  
  attemptReset(): void {
    if (this.stateManager.getState() === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.stateManager.transitionTo(CircuitState.HALF_OPEN, 'Attempting recovery');
        this.successCount = 0;
      }
    }
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.resetTimeout;
  }
  
  private resetCounters(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
  
  getState(): CircuitState {
    return this.stateManager.getState();
  }
}
```

## Best Practices

### State Management Guidelines
- Use appropriate thresholds
- Monitor state transitions
- Configure reset timeouts
- Track transition history
- Test state transitions

### Performance Considerations
- Minimize state check overhead
- Use efficient counters
- Monitor transition frequency
