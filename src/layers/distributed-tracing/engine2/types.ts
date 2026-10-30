/**
 * Distributed Tracing Engine 2 — shared types
 *
 * `engine/` is the ingest path (span model, processor, assembly).
 * `engine2/` is the *analysis* path over finished `SpanSnapshot` sets:
 *
 *   snapshots ──► TraceAnalyzer2
 *      ├─ tail sampling      (declarative keep rules: latency / error / attr)
 *      ├─ link analysis      (fan-in / fan-out per service & per operation)
 *      ├─ critical path      (longest end-to-end path through the DAG)
 *      └─ trace search       (attribute / service / duration predicates)
 *
 * @module DistributedTracingLayer/Engine2
 */

import type { SpanSnapshot } from '../engine/Span';
import type { IClock } from '../../observability/engine/signals';

export type { SpanSnapshot, IClock };

// ---------------------------------------------------------------------------
// Tail sampling (rule-engine flavour — distinct from the engine's policy
// interface: here rules are *data*, composable and inspectable)
// ---------------------------------------------------------------------------

export type SamplingRuleKind =
  | 'latency-above'   // trace duration exceeds threshold
  | 'latency-below'
  | 'has-error'       // any span carries ERROR status
  | 'attribute-eq'    // any span attribute equals a value
  | 'service'         // trace touches a given service.name
  | 'always'
  | 'never';

export interface SamplingRule {
  readonly kind: SamplingRuleKind;
  /** Keep or drop the trace when the rule matches. First match wins. */
  readonly decision: 'keep' | 'drop';
  /** kind-specific operand. */
  readonly thresholdMs?: number;
  readonly attributeKey?: string;
  readonly attributeValue?: string | number | boolean;
  readonly serviceName?: string;
  /** Human-readable name for decision reasons. */
  readonly name?: string;
}

export interface TailSamplingDecision {
  readonly traceId: string;
  readonly keep: boolean;
  /** Which rule decided, or 'default'. */
  readonly rule: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Link analysis
// ---------------------------------------------------------------------------

/** Edge in the service graph: caller → callee with call count + latency. */
export interface ServiceEdge {
  readonly callerService: string;
  readonly calleeService: string;
  readonly calls: number;
  readonly totalLatencyMs: number;
  readonly errors: number;
}

export interface ServiceNode {
  readonly service: string;
  /** Distinct upstream services calling into this one. */
  readonly fanIn: number;
  /** Distinct downstream services this one calls. */
  readonly fanOut: number;
  readonly spanCount: number;
  readonly selfTimeMs: number;
}

export interface LinkReport {
  readonly nodes: ReadonlyArray<ServiceNode>;
  readonly edges: ReadonlyArray<ServiceEdge>;
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

/**
 * One step of the critical path — the chain of spans whose sequential
 * execution accounts for the trace's end-to-end wall-clock duration.
 * `waitMs` is the gap before this span's parent handed off.
 */
export interface CriticalPathStep {
  readonly spanId: string;
  readonly name: string;
  readonly service: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly waitMs: number;
}

export interface CriticalPath {
  readonly traceId: string;
  readonly steps: ReadonlyArray<CriticalPathStep>;
  /** Sum of step durations (the "work" on the path). */
  readonly workMs: number;
  /** Trace wall-clock duration. */
  readonly wallClockMs: number;
  /** workMs / wallClockMs — how much of the trace the path explains. */
  readonly coverage: number;
}

// ---------------------------------------------------------------------------
// Trace search
// ---------------------------------------------------------------------------

export interface TraceQuery {
  readonly service?: string;
  readonly operation?: string;
  readonly minDurationMs?: number;
  readonly maxDurationMs?: number;
  /** Every pair must appear (on any span) for a match. */
  readonly attributes?: Record<string, string | number | boolean>;
  readonly status?: 'ERROR' | 'OK' | 'UNSET';
  readonly limit?: number;
}

export interface TraceSummary {
  readonly traceId: string;
  readonly rootName: string;
  readonly services: ReadonlyArray<string>;
  readonly spanCount: number;
  readonly durationMs: number;
  readonly hasError: boolean;
  readonly startedMs: number;
}
