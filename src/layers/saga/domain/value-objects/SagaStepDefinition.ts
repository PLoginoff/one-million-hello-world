/**
 * Saga Step Definition Value Object
 *
 * Represents a step definition in a saga.
 * Immutable value object for managing saga steps.
 */

export interface SagaStepDefinitionData {
  stepId: string;
  name: string;
  action: string;
  compensationAction?: string;
  timeout: number;
  retryPolicy: StepRetryPolicy;
  required: boolean;
  parallel: boolean;
}

export interface StepRetryPolicy {
  maxAttempts: number;
  delay: number;
}

export class SagaStepDefinition {
  readonly data: SagaStepDefinitionData;

  constructor(data: SagaStepDefinitionData) {
    this._validateStep(data);
    this.data = { ...data };
  }

  /**
   * Get step ID
   */
  getStepId(): string {
    return this.data.stepId;
  }

  /**
   * Get name
   */
  getName(): string {
    return this.data.name;
  }

  /**
   * Get action
   */
  getAction(): string {
    return this.data.action;
  }

  /**
   * Get compensation action
   */
  getCompensationAction(): string | undefined {
    return this.data.compensationAction;
  }

  /**
   * Get timeout
   */
  getTimeout(): number {
    return this.data.timeout;
  }

  /**
   * Get retry policy
   */
  getRetryPolicy(): StepRetryPolicy {
    return { ...this.data.retryPolicy };
  }

  /**
   * Check if required
   */
  isRequired(): boolean {
    return this.data.required;
  }

  /**
   * Check if parallel
   */
  isParallel(): boolean {
    return this.data.parallel;
  }

  /**
   * Check if has compensation
   */
  hasCompensation(): boolean {
    return !!this.data.compensationAction;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<SagaStepDefinitionData>): SagaStepDefinition {
    return new SagaStepDefinition({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): SagaStepDefinition {
    return new SagaStepDefinition({ ...this.data });
  }

  /**
   * Create required step
   */
  static createRequired(stepId: string, name: string, action: string): SagaStepDefinition {
    return new SagaStepDefinition({
      stepId,
      name,
      action,
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        delay: 1000,
      },
      required: true,
      parallel: false,
    });
  }

  /**
   * Create optional step
   */
  static createOptional(stepId: string, name: string, action: string): SagaStepDefinition {
    return new SagaStepDefinition({
      stepId,
      name,
      action,
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        delay: 1000,
      },
      required: false,
      parallel: false,
    });
  }

  private _validateStep(data: SagaStepDefinitionData): void {
    if (!data.stepId || data.stepId.trim().length === 0) {
      throw new Error('Step ID is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Step name is required');
    }

    if (!data.action || data.action.trim().length === 0) {
      throw new Error('Step action is required');
    }

    if (data.timeout < 0) {
      throw new Error('Timeout must be non-negative');
    }

    if (data.retryPolicy.maxAttempts < 1) {
      throw new Error('Max attempts must be at least 1');
    }

    if (data.retryPolicy.delay < 0) {
      throw new Error('Delay must be non-negative');
    }
  }
}
