/**
 * Facade Engine — public exports.
 *
 * @module FacadeLayer/Engine
 */

export {
  FacadeEngineError,
  SubsystemTimeoutError,
  RequiredSubsystemError,
  StepFailedError,
  EarlyExit,
  SystemEngineClock,
  ManualEngineClock,
} from './types';
export type { FacadeEngineClock, Subsystem } from './types';
export { AggregationEngine } from './AggregationEngine';
export type { TimeoutFn, AggregationOptions, AggregationResult } from './AggregationEngine';
export { BatchFacade } from './BatchFacade';
export type { BatchItemResult, BatchResult, BatchOptions } from './BatchFacade';
export { CachedFacade } from './CachedFacade';
export type { CachedFacadeOptions, CachedFacadeStats } from './CachedFacade';
export { OrchestrationFacade } from './OrchestrationFacade';
export type { Step, StepAuditEntry, OrchestrationResult, OrchestrationOptions } from './OrchestrationFacade';
export { RequestCollapser, CollapseLimitError } from './RequestCollapser';
export type { CollapserOptions, CollapserStats } from './RequestCollapser';
export { LoadShedder } from './LoadShedder';
export type { RequestPriority, ShedRequest, ShedderOptions, ShedDecision } from './LoadShedder';
export { ResponseComposer } from './ResponseComposer';
export type { FieldMapping } from './ResponseComposer';
export { CompensationStack } from './CompensationStack';
export type { Compensation, UnwindResult } from './CompensationStack';
export { BulkheadRouter } from './BulkheadRouter';
export type { RoutedBackend, RouterTicket } from './BulkheadRouter';
