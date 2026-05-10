/**
 * State Transition Strategy Interface
 * 
 * Defines the contract for state transition strategies.
 */

export interface IStateTransitionStrategy {
  /**
   * Determine if transition should occur
   * 
   * @param context - Transition context
   * @returns True if transition should occur
   */
  shouldTransition(context: TransitionContext): boolean;

  /**
   * Get target state
   * 
   * @param context - Transition context
   * @returns Target state
   */
  getTargetState(context: TransitionContext): string;

  /**
   * Get transition reason
   * 
   * @param context - Transition context
   * @returns Transition reason
   */
  getTransitionReason(context: TransitionContext): string;
}

export interface TransitionContext {
  currentState: string;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  currentTime: number;
  threshold: {
    failureThreshold: number;
    successThreshold: number;
    resetTimeout: number;
  };
}

export class DefaultStateTransitionStrategy implements IStateTransitionStrategy {
  shouldTransition(context: TransitionContext): boolean {
    switch (context.currentState) {
      case 'CLOSED':
        return context.failureCount >= context.threshold.failureThreshold;
      case 'OPEN':
        const timeSinceFailure = context.currentTime - context.lastFailureTime;
        return timeSinceFailure >= context.threshold.resetTimeout;
      case 'HALF_OPEN':
        return context.successCount >= context.threshold.successThreshold || context.failureCount > 0;
      default:
        return false;
    }
  }

  getTargetState(context: TransitionContext): string {
    switch (context.currentState) {
      case 'CLOSED':
        return 'OPEN';
      case 'OPEN':
        return 'HALF_OPEN';
      case 'HALF_OPEN':
        return context.successCount >= context.threshold.successThreshold ? 'CLOSED' : 'OPEN';
      default:
        return context.currentState;
    }
  }

  getTransitionReason(context: TransitionContext): string {
    switch (context.currentState) {
      case 'CLOSED':
        return `Failure threshold (${context.threshold.failureThreshold}) exceeded`;
      case 'OPEN':
        return `Reset timeout (${context.threshold.resetTimeout}ms) elapsed`;
      case 'HALF_OPEN':
        if (context.successCount >= context.threshold.successThreshold) {
          return `Success threshold (${context.threshold.successThreshold}) met`;
        }
        return 'Failure occurred during half-open state';
      default:
        return 'Unknown transition reason';
    }
  }
}
