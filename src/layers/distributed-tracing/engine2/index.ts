/**
 * Distributed Tracing Engine 2 — public surface.
 *
 * Trace analysis layer: rule-based tail sampling, service link
 * analysis, critical path detection, and trace search.
 *
 * @module DistributedTracingLayer/Engine2
 */

export * from './types';
export * from './TraceAnalyzer';
export * from './TraceDiff';
export * from './ServiceLevelAggregator';
export * from './AdaptiveSampler';
