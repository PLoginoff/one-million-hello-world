/**
 * Saga State Implementation
 * 
 * Concrete implementation of ISagaState.
 * Manages saga execution state with snapshot support.
 */

import { ISagaState, SagaStatus, SagaStateSnapshot } from '../interfaces/ISagaState';
import { ILogger } from '../interfaces/ILogger';

export class SagaState implements ISagaState {
  private _status: SagaStatus;
  private _executedSteps: string[];
  private _compensatedSteps: string[];
  private _currentStepIndex: number;
  private _totalSteps: number;
  private _error?: string;
  private readonly _logger: ILogger;

  constructor(logger: ILogger) {
    this._logger = logger;
    this._status = SagaStatus.PENDING;
    this._executedSteps = [];
    this._compensatedSteps = [];
    this._currentStepIndex = 0;
    this._totalSteps = 0;
    this._error = undefined;
  }

  getStatus(): SagaStatus {
    return this._status;
  }

  setStatus(status: SagaStatus): void {
    const previousStatus = this._status;
    this._status = status;
    this._logger.debug(`Saga status changed: ${previousStatus} -> ${status}`);
  }

  addExecutedStep(stepName: string): void {
    this._executedSteps.push(stepName);
    this._logger.debug(`Step executed: ${stepName}`, { totalExecuted: this._executedSteps.length });
  }

  getExecutedSteps(): string[] {
    return [...this._executedSteps];
  }

  addCompensatedStep(stepName: string): void {
    this._compensatedSteps.push(stepName);
    this._logger.debug(`Step compensated: ${stepName}`, { totalCompensated: this._compensatedSteps.length });
  }

  getCompensatedSteps(): string[] {
    return [...this._compensatedSteps];
  }

  setCurrentStepIndex(index: number): void {
    this._currentStepIndex = index;
    this._logger.debug(`Current step index set to: ${index}`);
  }

  getCurrentStepIndex(): number {
    return this._currentStepIndex;
  }

  setTotalSteps(count: number): void {
    this._totalSteps = count;
    this._logger.debug(`Total steps set to: ${count}`);
  }

  getTotalSteps(): number {
    return this._totalSteps;
  }

  setError(error: string): void {
    this._error = error;
    this._logger.error(`Saga error set: ${error}`);
  }

  getError(): string | undefined {
    return this._error;
  }

  clearError(): void {
    this._error = undefined;
    this._logger.debug('Saga error cleared');
  }

  reset(): void {
    this._status = SagaStatus.PENDING;
    this._executedSteps = [];
    this._compensatedSteps = [];
    this._currentStepIndex = 0;
    this._totalSteps = 0;
    this._error = undefined;
    this._logger.debug('Saga state reset');
  }

  createSnapshot(): SagaStateSnapshot {
    return {
      status: this._status,
      executedSteps: [...this._executedSteps],
      compensatedSteps: [...this._compensatedSteps],
      currentStepIndex: this._currentStepIndex,
      totalSteps: this._totalSteps,
      error: this._error,
      timestamp: Date.now(),
    };
  }

  restoreFromSnapshot(snapshot: SagaStateSnapshot): void {
    this._status = snapshot.status;
    this._executedSteps = [...snapshot.executedSteps];
    this._compensatedSteps = [...snapshot.compensatedSteps];
    this._currentStepIndex = snapshot.currentStepIndex;
    this._totalSteps = snapshot.totalSteps;
    this._error = snapshot.error;
    this._logger.debug('Saga state restored from snapshot', { timestamp: snapshot.timestamp });
  }
}
