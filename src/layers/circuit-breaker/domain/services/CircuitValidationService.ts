/**
 * Circuit Validation Service
 * 
 * Domain service for validating circuit breaker operations and configurations.
 * Provides validation logic for circuit states, thresholds, and operations.
 */

import { CircuitThreshold } from '../value-objects/CircuitThreshold';
import { CircuitMetrics } from '../value-objects/CircuitMetrics';
import { CircuitStateEntity } from '../entities/CircuitState';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export class CircuitValidationService {
  /**
   * Validate circuit threshold configuration
   */
  validateThreshold(threshold: CircuitThreshold): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      CircuitThreshold.createDefault();
    } catch (error) {
      errors.push({
        field: 'threshold',
        message: error instanceof Error ? error.message : 'Invalid threshold configuration',
        code: 'INVALID_THRESHOLD',
      });
    }

    if (threshold.getFailureThreshold() < 1) {
      warnings.push({
        field: 'failureThreshold',
        message: 'Failure threshold is very low, may cause frequent tripping',
        code: 'LOW_FAILURE_THRESHOLD',
      });
    }

    if (threshold.getFailureThreshold() > 100) {
      warnings.push({
        field: 'failureThreshold',
        message: 'Failure threshold is very high, may delay circuit opening',
        code: 'HIGH_FAILURE_THRESHOLD',
      });
    }

    if (threshold.getSuccessThreshold() > threshold.getFailureThreshold()) {
      warnings.push({
        field: 'successThreshold',
        message: 'Success threshold exceeds failure threshold, may delay recovery',
        code: 'HIGH_SUCCESS_THRESHOLD',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate circuit state transition
   */
  validateStateTransition(
    currentState: string,
    newState: string,
    metrics: CircuitMetrics,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const validStates = ['CLOSED', 'OPEN', 'HALF_OPEN'];

    if (!validStates.includes(currentState)) {
      errors.push({
        field: 'currentState',
        message: `Invalid current state: ${currentState}`,
        code: 'INVALID_CURRENT_STATE',
      });
    }

    if (!validStates.includes(newState)) {
      errors.push({
        field: 'newState',
        message: `Invalid new state: ${newState}`,
        code: 'INVALID_NEW_STATE',
      });
    }

    if (currentState === newState) {
      warnings.push({
        field: 'stateTransition',
        message: 'Transitioning to the same state has no effect',
        code: 'NO_OP_TRANSITION',
      });
    }

    const validTransitions: Record<string, string[]> = {
      CLOSED: ['OPEN', 'HALF_OPEN'],
      OPEN: ['HALF_OPEN', 'CLOSED'],
      HALF_OPEN: ['CLOSED', 'OPEN'],
    };

    if (validStates.includes(currentState) && validStates.includes(newState)) {
      const allowedTransitions = validTransitions[currentState];
      if (!allowedTransitions || !allowedTransitions.includes(newState)) {
        errors.push({
          field: 'stateTransition',
          message: `Invalid transition from ${currentState} to ${newState}`,
          code: 'INVALID_TRANSITION',
        });
      }
    }

    if (metrics.getFailureRate() > 0.9 && newState === 'CLOSED') {
      warnings.push({
        field: 'stateTransition',
        message: 'Closing circuit while failure rate is high may not be optimal',
        code: 'HIGH_FAILURE_RATE_ON_CLOSE',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate circuit metrics
   */
  validateMetrics(metrics: CircuitMetrics): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (metrics.data.totalRequests < 0) {
      errors.push({
        field: 'totalRequests',
        message: 'Total requests cannot be negative',
        code: 'NEGATIVE_TOTAL_REQUESTS',
      });
    }

    if (metrics.data.successfulRequests < 0) {
      errors.push({
        field: 'successfulRequests',
        message: 'Successful requests cannot be negative',
        code: 'NEGATIVE_SUCCESSFUL_REQUESTS',
      });
    }

    if (metrics.data.failedRequests < 0) {
      errors.push({
        field: 'failedRequests',
        message: 'Failed requests cannot be negative',
        code: 'NEGATIVE_FAILED_REQUESTS',
      });
    }

    if (metrics.data.rejectedRequests < 0) {
      errors.push({
        field: 'rejectedRequests',
        message: 'Rejected requests cannot be negative',
        code: 'NEGATIVE_REJECTED_REQUESTS',
      });
    }

    const calculatedTotal =
      metrics.data.successfulRequests + metrics.data.failedRequests + metrics.data.rejectedRequests;

    if (calculatedTotal !== metrics.data.totalRequests) {
      errors.push({
        field: 'totalRequests',
        message: 'Total requests does not match sum of individual request types',
        code: 'REQUEST_COUNT_MISMATCH',
      });
    }

    if (metrics.data.averageResponseTime < 0) {
      errors.push({
        field: 'averageResponseTime',
        message: 'Average response time cannot be negative',
        code: 'NEGATIVE_AVERAGE_RESPONSE_TIME',
      });
    }

    if (metrics.data.minResponseTime < 0) {
      errors.push({
        field: 'minResponseTime',
        message: 'Minimum response time cannot be negative',
        code: 'NEGATIVE_MIN_RESPONSE_TIME',
      });
    }

    if (metrics.data.maxResponseTime < 0) {
      errors.push({
        field: 'maxResponseTime',
        message: 'Maximum response time cannot be negative',
        code: 'NEGATIVE_MAX_RESPONSE_TIME',
      });
    }

    if (metrics.data.minResponseTime > metrics.data.maxResponseTime && metrics.data.maxResponseTime > 0) {
      errors.push({
        field: 'responseTimeRange',
        message: 'Minimum response time cannot be greater than maximum response time',
        code: 'INVALID_RESPONSE_TIME_RANGE',
      });
    }

    if (metrics.data.totalRequests > 0 && metrics.getSuccessRate() < 0.1) {
      warnings.push({
        field: 'successRate',
        message: 'Success rate is very low, consider investigating',
        code: 'LOW_SUCCESS_RATE',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate circuit state entity
   */
  validateCircuitState(state: CircuitStateEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const validStates = ['CLOSED', 'OPEN', 'HALF_OPEN'];

    if (!validStates.includes(state.currentState)) {
      errors.push({
        field: 'currentState',
        message: `Invalid current state: ${state.currentState}`,
        code: 'INVALID_CURRENT_STATE',
      });
    }

    if (!validStates.includes(state.previousState)) {
      errors.push({
        field: 'previousState',
        message: `Invalid previous state: ${state.previousState}`,
        code: 'INVALID_PREVIOUS_STATE',
      });
    }

    if (state.metadata.totalTransitions !== state.transitions.length) {
      errors.push({
        field: 'transitionCount',
        message: 'Transition count does not match transition history length',
        code: 'TRANSITION_COUNT_MISMATCH',
      });
    }

    if (state.transitions.length > 0) {
      const lastTransition = state.transitions[state.transitions.length - 1];
      if (lastTransition && lastTransition.to !== state.currentState) {
        errors.push({
          field: 'transitionHistory',
          message: 'Last transition does not match current state',
          code: 'TRANSITION_HISTORY_MISMATCH',
        });
      }
    }

    if (state.getTimeSinceLastChange() < 0) {
      errors.push({
        field: 'timeSinceLastChange',
        message: 'Time since last change cannot be negative',
        code: 'NEGATIVE_TIME_SINCE_CHANGE',
      });
    }

    if (state.getTransitionCount() > 1000) {
      warnings.push({
        field: 'transitionCount',
        message: 'High number of transitions, consider reviewing circuit stability',
        code: 'HIGH_TRANSITION_COUNT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
