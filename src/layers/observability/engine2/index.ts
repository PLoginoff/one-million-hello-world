/**
 * Observability Engine 2 — public surface.
 *
 * Ops-layer analysis on top of the telemetry path in `engine/`:
 * rollup, alert evaluation, SLO tracking, cost estimation.
 *
 * @module ObservabilityLayer/Engine2
 */

export * from './types';
export * from './MetricRollup';
export * from './AlertEvaluator';
export * from './SloTracker';
export * from './TelemetryCostEstimator';
export * from './AnomalyScorer';
