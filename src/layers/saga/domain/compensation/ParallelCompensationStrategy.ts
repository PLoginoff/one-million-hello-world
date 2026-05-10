/**
 * Parallel Compensation Strategy
 *
 * Compensates steps in parallel when possible.
 * Used for performance optimization when steps are independent.
 */

import { SagaExecutionEntity } from '../entities/SagaExecution';

export class ParallelCompensationStrategy {
  /**
   * Get compensation groups
   */
  getCompensationGroups(execution: SagaExecutionEntity): string[][] {
    const completedSteps = execution.steps
      .filter(s => s.status === 'completed')
      .map(s => s.stepId);

    const compensatedSteps = execution.compensationSteps
      .filter(s => s.status === 'completed')
      .map(s => s.originalStepId);

    const remainingSteps = completedSteps.filter(s => !compensatedSteps.includes(s));

    return this._groupIndependentSteps(remainingSteps, execution);
  }

  /**
   * Check if step should be compensated
   */
  shouldCompensate(step: any): boolean {
    return step.status === 'completed';
  }

  /**
   * Get all steps ready for parallel compensation
   */
  getParallelCompensationSteps(execution: SagaExecutionEntity): string[] {
    const groups = this.getCompensationGroups(execution);
    if (groups.length === 0) {
      return [];
    }
    return groups[0];
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

  private _groupIndependentSteps(steps: string[], execution: SagaExecutionEntity): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const step of steps) {
      if (processed.has(step)) {
        continue;
      }

      const group = [step];
      processed.add(step);

      for (const otherStep of steps) {
        if (processed.has(otherStep)) {
          continue;
        }

        if (this._areIndependent(step, otherStep, execution)) {
          group.push(otherStep);
          processed.add(otherStep);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private _areIndependent(step1: string, step2: string, execution: SagaExecutionEntity): boolean {
    return true;
  }
}
