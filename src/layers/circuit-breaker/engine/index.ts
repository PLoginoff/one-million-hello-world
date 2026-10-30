/**
 * Circuit Breaker Engine — public exports.
 *
 * @module CircuitBreakerLayer/Engine
 */

export {
  BreakerState,
  BreakerEngineError,
  CircuitRejectionError,
  ProbeQueueFullError,
  FallbackChainExhaustedError,
  SystemEngineClock,
  ManualEngineClock,
} from './types';
export type {
  BreakerEngineClock,
  EndpointBreakerConfig,
  BreakerStats,
  BreakerStateSnapshot,
  BreakerRegistrySnapshot,
} from './types';
export { EndpointBreaker } from './EndpointBreaker';
export type { BreakerEventListener } from './EndpointBreaker';
export { BreakerRegistry } from './BreakerRegistry';
export type { RegistryOptions, FleetMetrics } from './BreakerRegistry';
export { ProbeScheduler } from './ProbeScheduler';
export type { ProbeSchedulerOptions, ProbeTicket } from './ProbeScheduler';
export { AutoTuner } from './AutoTuner';
export type { AutoTunerOptions, TuneDecision } from './AutoTuner';
export { TimeWindow, CallWindow } from './WindowedMetrics';
export type { CallOutcome } from './WindowedMetrics';
export { BulkheadSemaphore, BulkheadRejectedError } from './BulkheadSemaphore';
export type { BulkheadOptions, BulkheadTicket } from './BulkheadSemaphore';
export { CanaryProbe } from './CanaryProbe';
export type { CanaryProbeOptions, ProbeOutcome } from './CanaryProbe';
export { AdaptiveResetBackoff } from './AdaptiveResetBackoff';
export type { ResetBackoffOptions } from './AdaptiveResetBackoff';
export { HealthVerdict } from './HealthVerdict';
export type { VerdictLevel, HealthVerdictOptions, Verdict } from './HealthVerdict';
export { FallbackChain } from './FallbackChain';
export type {
  FallbackFunction,
  AcceptPredicate,
  ShouldFallbackPredicate,
  FallbackChainOptions,
  ChainAttempt,
  ChainResult,
} from './FallbackChain';
