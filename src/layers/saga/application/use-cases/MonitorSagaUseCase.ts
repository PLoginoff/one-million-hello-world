/**
 * Monitor Saga Use Case
 *
 * Application use case for monitoring saga executions.
 * Contains business logic for saga monitoring and observability.
 */

import { SagaExecutionEntity } from '../../domain/entities/SagaExecution';

export interface SagaMetrics {
  executionId: string;
  sagaId: string;
  status: string;
  duration: number;
  completedSteps: number;
  failedSteps: number;
  totalSteps: number;
  attemptCount: number;
  timestamp: number;
}

export class MonitorSagaUseCase {
  /**
   * Get metrics for a saga execution
   */
  getMetrics(execution: SagaExecutionEntity): SagaMetrics {
    return {
      executionId: execution.executionId,
      sagaId: execution.sagaId,
      status: execution.status,
      duration: execution.getDuration(),
      completedSteps: execution.getCompletedStepsCount(),
      failedSteps: execution.getFailedStepsCount(),
      totalSteps: execution.steps.length,
      attemptCount: execution.metadata.getAttemptCount(),
      timestamp: Date.now(),
    };
  }

  /**
   * Get health status of a saga execution
   */
  getHealthStatus(execution: SagaExecutionEntity): 'healthy' | 'degraded' | 'unhealthy' {
    if (execution.isCompleted()) {
      return 'healthy';
    }

    if (execution.isFailed() || execution.isCompensating()) {
      return 'unhealthy';
    }

    if (execution.isRunning()) {
      const failedSteps = execution.getFailedStepsCount();
      if (failedSteps > 0) {
        return 'degraded';
      }
      return 'healthy';
    }

    return 'healthy';
  }

  /**
   * Get progress percentage
   */
  getProgress(execution: SagaExecutionEntity): number {
    if (execution.steps.length === 0) {
      return 0;
    }

    const completedSteps = execution.getCompletedStepsCount();
    return (completedSteps / execution.steps.length) * 100;
  }

  /**
   * Get estimated time remaining
   */
  getEstimatedTimeRemaining(execution: SagaExecutionEntity): number {
    if (!execution.isRunning() || execution.steps.length === 0) {
      return 0;
    }

    const completedSteps = execution.getCompletedStepsCount();
    if (completedSteps === 0) {
      return 0;
    }

    const averageStepDuration = execution.getDuration() / completedSteps;
    const remainingSteps = execution.steps.length - completedSteps;

    return Math.round(averageStepDuration * remainingSteps);
  }

  /**
   * Get step breakdown
   */
  getStepBreakdown(execution: SagaExecutionEntity): Record<string, number> {
    const breakdown: Record<string, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const step of execution.steps) {
      const status = step.status as string;
      if (status in breakdown) {
        breakdown[status]++;
      }
    }

    return breakdown;
  }

  /**
   * Check if saga is stuck
   */
  isStuck(execution: SagaExecutionEntity, timeout: number = 300000): boolean {
    if (!execution.isRunning()) {
      return false;
    }

    const lastActivity = execution.metadata.getLastAttemptTime();
    if (lastActivity === 0) {
      return false;
    }

    const timeSinceLastActivity = Date.now() - lastActivity;

    return timeSinceLastActivity > timeout;
  }

  /**
   * Get timeout status
   */
  getTimeoutStatus(execution: SagaExecutionEntity, configTimeout: number): 'ok' | 'warning' | 'timeout' {
    const duration = execution.getDuration();
    const threshold = configTimeout * 0.8;

    if (duration > configTimeout) {
      return 'timeout';
    }

    if (duration > threshold) {
      return 'warning';
    }

    return 'ok';
  }
}
