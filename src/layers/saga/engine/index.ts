/**
 * Saga Engine — public surface.
 *
 * Second orchestrator for the layer: explicit lifecycle state machine,
 * compensation-carrying step definitions, clock-injected per-step timeouts
 * and retry backoff, append-only saga log, isolated concurrent instances.
 *
 * @module SagaLayer/Engine
 */

export { SagaEngine } from './SagaEngine';
export type { SagaDefinition, SagaEngineOptions } from './SagaEngine';
export { SagaLog } from './SagaLog';
export { ManualScheduler, SystemScheduler } from './ManualScheduler';
export {
  IllegalTransitionError,
  StepTimeoutError,
  UnknownSagaError,
  LEGAL_TRANSITIONS,
} from './types';
export type {
  SagaLifecycle,
  SagaClock,
  SagaScheduler,
  SagaStepDef,
  StepContext,
  SagaLogEntry,
} from './types';
