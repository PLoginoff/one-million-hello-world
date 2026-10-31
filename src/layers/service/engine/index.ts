/**
 * Service Engine — public exports.
 *
 * Executable service core: unit-of-work transaction scripts, service
 * middleware composition, idempotency store, bulkhead, retry with
 * jitter, timeout, and circuit-breaker hooks.
 *
 * @module ServiceLayer/Engine
 */

export * from './types';

export {
  TransactionScriptRunner,
  TransactionError,
  StagedUnitOfWork,
  InMemoryRecordStore,
  SystemClock,
  ManualClock,
} from './TransactionScriptRunner';
export type { Clock, TransactionReport } from './TransactionScriptRunner';

export {
  ServicePipeline,
  Bulkhead,
  InMemoryIdempotencyStore,
  IdempotencyMismatchError,
  SystemScheduler,
  ManualScheduler,
  withTimeout,
  retryDelay,
  DEFAULT_RETRY_POLICY,
} from './ServicePipeline';
export type { Scheduler, ServicePipelineOptions } from './ServicePipeline';

export { ServiceSaga, defineSaga } from './ServiceSaga';
export type {
  SagaStep,
  SagaStepContext,
  SagaReport,
  ServiceSagaOptions,
} from './ServiceSaga';

export {
  ServiceMesh,
  tracingInterceptor,
  contextPropagationInterceptor,
  cacheInterceptor,
} from './ServiceMesh';
export type {
  MeshCall,
  MeshResult,
  MeshNext,
  MeshInterceptor,
  MeshTransport,
  ServiceMeshOptions,
} from './ServiceMesh';

export { RequestCoalescer } from './RequestCoalescer';
export type { CoalescerOptions, CoalescerStats } from './RequestCoalescer';

export { ServiceCache, renderKeyTemplate } from './ServiceCache';
export type {
  ServiceCacheOptions,
  KeyTemplate,
  KeyTemplateContext,
  CachedCallOptions,
  ServiceCacheStats,
} from './ServiceCache';

export { ServiceOperationRegistry } from './ServiceOperationRegistry';
export type {
  OperationDefinition,
  OperationResult,
  OperationRegistryOptions,
} from './ServiceOperationRegistry';

export { ServiceHealthProbe } from './ServiceHealthProbe';
export type {
  ProbeOutcome,
  HealthProbeOptions,
  ProbeReport,
} from './ServiceHealthProbe';

export { CircuitEndpoint, CircuitRegistry } from './CircuitPropagation';
export type {
  CircuitState,
  WindowConfig,
  CallOutcome,
  EndpointHealth,
  PropagatedHealth,
  CircuitRegistryOptions,
} from './CircuitPropagation';
