/**
 * Middleware Engine — public exports.
 *
 * Executable middleware core: conditional composition, per-stage
 * timeouts, correlation propagation, OTLP span export, and
 * per-middleware latency histograms.
 *
 * @module MiddlewareLayer/Engine
 */

export * from './types';

export {
  MiddlewareEngine,
  MiddlewareEngineBuilder,
  MiddlewareTimeoutError,
  SystemClock,
  ManualClock,
  SystemScheduler,
  pathMatches,
  methodIn,
  headerEquals,
  and,
  or,
  not,
} from './MiddlewareEngine';
export type {
  Clock,
  Scheduler,
  MiddlewareEngineHooks,
  MiddlewareEngineOptions,
} from './MiddlewareEngine';

export {
  CorrelationContextPropagator,
  MathRandomSource,
  DeterministicRandomSource,
  parseTraceParent,
  formatTraceParent,
  isValidTraceId,
  isValidSpanId,
} from './CorrelationContextPropagator';
export type { RandomSource } from './CorrelationContextPropagator';

export {
  OtelSpanExporter,
  toOtelSpan,
  toOtelStatus,
  toAnyValue,
  millisToUnixNano,
} from './OtelSpanExporter';

export {
  DurationHistogram,
  MiddlewareMetricsCollector,
  DEFAULT_LATENCY_BUCKETS,
} from './MiddlewareMetrics';
