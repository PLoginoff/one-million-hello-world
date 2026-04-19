/**
 * Saga State Interface
 * 
 * Defines the contract for managing saga state
 * in the Saga Layer.
 */

export enum SagaStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}

export interface SagaStateSnapshot {
  status: SagaStatus;
  executedSteps: string[];
  compensatedSteps: string[];
  currentStepIndex: number;
  totalSteps: number;
  error?: string;
  timestamp: number;
}

export interface ISagaState {
  /**
   * Gets the current saga status
   * 
   * @returns Current saga status
   */
  getStatus(): SagaStatus;

  /**
   * Sets the saga status
   * 
   * @param status - New saga status
   */
  setStatus(status: SagaStatus): void;

  /**
   * Adds an executed step
   * 
   * @param stepName - Name of the executed step
   */
  addExecutedStep(stepName: string): void;

  /**
   * Gets all executed steps
   * 
   * @returns Array of executed step names
   */
  getExecutedSteps(): string[];

  /**
   * Adds a compensated step
   * 
   * @param stepName - Name of the compensated step
   */
  addCompensatedStep(stepName: string): void;

  /**
   * Gets all compensated steps
   * 
   * @returns Array of compensated step names
   */
  getCompensatedSteps(): string[];

  /**
   * Sets the current step index
   * 
   * @param index - Current step index
   */
  setCurrentStepIndex(index: number): void;

  /**
   * Gets the current step index
   * 
   * @returns Current step index
   */
  getCurrentStepIndex(): number;

  /**
   * Sets the total number of steps
   * 
   * @param count - Total number of steps
   */
  setTotalSteps(count: number): void;

  /**
   * Gets the total number of steps
   * 
   * @returns Total number of steps
   */
  getTotalSteps(): number;

  /**
   * Sets the error message
   * 
   * @param error - Error message
   */
  setError(error: string): void;

  /**
   * Gets the error message
   * 
   * @returns Error message or undefined
   */
  getError(): string | undefined;

  /**
   * Clears the error message
   */
  clearError(): void;

  /**
   * Resets the state to initial values
   */
  reset(): void;

  /**
   * Creates a snapshot of the current state
   * 
   * @returns State snapshot
   */
  createSnapshot(): SagaStateSnapshot;

  /**
   * Restores the state from a snapshot
   * 
   * @param snapshot - State snapshot to restore
   */
  restoreFromSnapshot(snapshot: SagaStateSnapshot): void;
}
