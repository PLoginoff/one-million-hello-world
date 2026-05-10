/**
 * Forward Compensation Strategy
 *
 * Compensates steps in the same order as execution.
 * Used when compensation must follow execution order.
 */

import { SagaExecutionEntity } from '../entities/SagaExecution';

export class ForwardCompensationStrategy {
  /**
   * Get compensation order
   */
  getCompensationOrder(execution: SagaExecutionEntity): string[] {
    const completedSteps = execution.steps
      .filter(s => s.status === 'completed')
      .map(s => s.stepId);

    return completedSteps;
  }

  /**
   * Check if step should be compensated
   */
  shouldCompensate(step: any): boolean {
    return step.status === 'completed';
  }

  /**
   * Get next step to compensate
   */
  getNextStepToCompensate(execution: SagaExecutionEntity): string | null {
    const compensationOrder = this.getCompensationOrder(execution);
    const compensatedSteps = execution.compensationSteps
      .filter(s => s.status === 'completed')
      .map(s => s.originalStepId);

    for (const stepId of compensationOrder) {
      if (!compensatedSteps.includes(stepId)) {
        return stepId;
      }
    }

    return null;
  }

  /**
   * Validate compensation strategy
   */
  validate(execution: SagaExecutionEntity): { valid: boolean; reason?: string } {
    if (execution.compensationSteps.length === 0) {
      return { valid: false, reason: 'No compensation steps defined' };
    }

    const completedSteps = execution.steps.filter(s => s.status === 'completed');
    if (completedSteps.length === 0) {
      return { valid: false, reason: 'No completed steps to compensate' };
    }

    return { valid: true };
  }
}
