/**
 * Saga Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Saga Layer (Layer 20 of the 25-layer architecture).
 *
 * The Saga Layer provides distributed transactions
 * and compensation with Clean Architecture.
 *
 * @module SagaLayer
 */

// Legacy exports (backward compatibility)
export { ISagaManager } from './interfaces/ISagaManager';
export { SagaManager as LegacySagaManager } from './implementations/SagaManager';

export { ILogger, LogLevel } from './interfaces/ILogger';
export { Logger as LegacyLogger } from './implementations/Logger';

export { ICompensationStrategy, CompensationContext, CompensationResult } from './interfaces/ICompensationStrategy';
export { CompensationStrategy as LegacyCompensationStrategy } from './implementations/CompensationStrategy';

export { IStepExecutor, StepExecutionContext, StepExecutionResult } from './interfaces/IStepExecutor';
export { StepExecutor as LegacyStepExecutor } from './implementations/StepExecutor';

export { ISagaState, SagaStatus, SagaStateSnapshot } from './interfaces/ISagaState';
export { SagaState as LegacySagaState } from './implementations/SagaState';

export { IErrorHandler, ErrorSeverity, ErrorContext, HandledError } from './interfaces/IErrorHandler';
export { ErrorHandler as LegacyErrorHandler } from './implementations/ErrorHandler';

export { ISagaOrchestrator, OrchestratorConfig } from './interfaces/ISagaOrchestrator';
export { SagaOrchestrator as LegacySagaOrchestrator } from './implementations/SagaOrchestrator';

export { ICompensationOrchestrator, CompensationResult as CompOrchestrationResult } from './interfaces/ICompensationOrchestrator';
export { CompensationOrchestrator as LegacyCompensationOrchestrator } from './implementations/CompensationOrchestrator';

export { ISagaValidator, ValidationError as LegacyValidationError, ValidationResult as LegacyValidationResult } from './interfaces/ISagaValidator';
export { SagaValidator as LegacySagaValidator } from './implementations/SagaValidator';

export * from './types/saga-types';

// New Clean Architecture exports

// Domain Layer
export { SagaExecutionEntity, SagaStep, CompensationStep } from './domain/entities/SagaExecution';
export { SagaMetadata, SagaMetadataData } from './domain/value-objects/SagaMetadata';
export { SagaConfig, SagaConfigData, RetryPolicy, BackoffStrategy, CompensationStrategy, IsolationLevel } from './domain/value-objects/SagaConfig';
export { SagaStepDefinition, SagaStepDefinitionData, StepRetryPolicy } from './domain/value-objects/SagaStepDefinition';
export {
  SagaValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/SagaValidationService';

// Configuration Layer
export { SagaDefaults, SagaConfigDefaults } from './configuration/defaults/SagaDefaults';
export { SagaConfigBuilder, SagaBuilderConfig } from './configuration/builders/SagaConfigBuilder';
export {
  SagaConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/SagaConfigValidator';

// Application Layer
export { ExecuteSagaUseCase } from './application/use-cases/ExecuteSagaUseCase';
export { CompensateSagaUseCase } from './application/use-cases/CompensateSagaUseCase';
export { RetrySagaUseCase } from './application/use-cases/RetrySagaUseCase';
export { MonitorSagaUseCase, SagaMetrics } from './application/use-cases/MonitorSagaUseCase';

// Infrastructure Layer
export { SagaExecutionRepository, InMemorySagaExecutionRepository } from './infrastructure/repositories/SagaExecutionRepository';
export { SagaConfigRepository, InMemorySagaConfigRepository } from './infrastructure/repositories/SagaConfigRepository';
export { SagaEventRepository, InMemorySagaEventRepository } from './infrastructure/repositories/SagaEventRepository';

// State Machine
export { SagaStateMachine, SagaState, StateTransition } from './domain/state-machine/SagaStateMachine';
export { StepStateMachine, StepState, StepStateTransition } from './domain/state-machine/StepStateMachine';
export { StateMachineFactory } from './domain/state-machine/StateMachineFactory';

// Event Sourcing
export { SagaEvent, SagaEventData, SagaEventType } from './domain/event-sourcing/SagaEvent';
export { EventStore, InMemoryEventStore } from './domain/event-sourcing/EventStore';
export { EventReconstructor } from './domain/event-sourcing/EventReconstructor';
export { SagaSnapshot, SnapshotData } from './domain/event-sourcing/Snapshot';

// Compensation Strategies
export { BackwardCompensationStrategy } from './domain/compensation/BackwardCompensationStrategy';
export { ForwardCompensationStrategy } from './domain/compensation/ForwardCompensationStrategy';
export { ParallelCompensationStrategy } from './domain/compensation/ParallelCompensationStrategy';
export { CompensationStrategyFactory, CompensationStrategyType } from './domain/compensation/CompensationStrategyFactory';

// Monitoring & Observability
export { SagaMetricsCollector, SagaMetricsData } from './monitoring/metrics/SagaMetricsCollector';
export { SagaTracer, Trace, TraceSpan } from './monitoring/tracing/SagaTracer';
export { SagaAlertManager, AlertRule, Alert } from './monitoring/alerts/SagaAlertManager';

// Orchestration Patterns
export { OrchestratorPattern } from './orchestration/OrchestratorPattern';
export { ChoreographyPattern } from './orchestration/ChoreographyPattern';

// Event Bus Integration
export { KafkaEventBus, KafkaConfig, KafkaMessage } from './integration/event-bus/KafkaEventBus';
export { RabbitMQEventBus, RabbitMQConfig, RabbitMQMessage } from './integration/event-bus/RabbitMQEventBus';
export { EventBusFactory, EventBusType } from './integration/event-bus/EventBusFactory';

// Persistence Layer
export { PostgreSQLAdapter, PostgreSQLConfig } from './persistence/adapters/PostgreSQLAdapter';
export { MongoDBAdapter, MongoDBConfig } from './persistence/adapters/MongoDBAdapter';
export { RedisAdapter, RedisConfig } from './persistence/adapters/RedisAdapter';

// Testing Framework
export { SagaTestBuilder } from './testing/SagaTestBuilder';
export { SagaTestRunner, TestScenario, TestResult } from './testing/SagaTestRunner';

// Analytics
export { SagaAnalytics, AnalyticsReport } from './analytics/SagaAnalytics';

// Security
export { SecurityManager, SecurityPolicy, SecurityRule, AuditLogEntry } from './security/SecurityManager';
