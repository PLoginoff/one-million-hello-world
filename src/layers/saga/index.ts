/**
 * Saga Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Saga Layer (Layer 20 of the 25-layer architecture).
 * 
 * The Saga Layer provides distributed transactions
 * and compensation with multiple abstraction layers.
 * 
 * @module SagaLayer
 */

export { ISagaManager } from './interfaces/ISagaManager';
export { SagaManager } from './implementations/SagaManager';

export { ILogger, LogLevel } from './interfaces/ILogger';
export { Logger } from './implementations/Logger';

export { ICompensationStrategy, CompensationContext, CompensationResult } from './interfaces/ICompensationStrategy';
export { CompensationStrategy } from './implementations/CompensationStrategy';

export { IStepExecutor, StepExecutionContext, StepExecutionResult } from './interfaces/IStepExecutor';
export { StepExecutor } from './implementations/StepExecutor';

export { ISagaState, SagaStatus, SagaStateSnapshot } from './interfaces/ISagaState';
export { SagaState } from './implementations/SagaState';

export { IErrorHandler, ErrorSeverity, ErrorContext, HandledError } from './interfaces/IErrorHandler';
export { ErrorHandler } from './implementations/ErrorHandler';

export { ISagaOrchestrator, OrchestratorConfig } from './interfaces/ISagaOrchestrator';
export { SagaOrchestrator } from './implementations/SagaOrchestrator';

export { ICompensationOrchestrator, CompensationResult as CompOrchestrationResult } from './interfaces/ICompensationOrchestrator';
export { CompensationOrchestrator } from './implementations/CompensationOrchestrator';

export { ISagaValidator, ValidationError, ValidationResult } from './interfaces/ISagaValidator';
export { SagaValidator } from './implementations/SagaValidator';

export * from './types/saga-types';
