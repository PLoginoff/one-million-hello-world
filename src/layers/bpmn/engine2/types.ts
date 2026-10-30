/**
 * BPMN Engine2 — shared types.
 *
 * Types for the process-analysis module: instance timing analytics
 * (bottleneck detection), what-if simulation under resource
 * constraints, ad-hoc dynamic task insertion, definition versioning
 * that pins running instances, and timer boundary-event semantics
 * (interrupting vs non-interrupting).
 *
 * @module BpmnLayer/Engine2
 */

import type { IClock } from '../engines/types';
export type { IClock };
export { SystemClock, TestClock } from '../engines/types';

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** Timing record for one node's execution inside an instance. */
export interface NodeTiming {
  nodeId: string;
  /** Epoch ms the token entered the node. */
  enteredAt: number;
  /** Epoch ms the token left the node (moved to next). */
  exitedAt: number;
  /** Instance this timing belongs to. */
  instanceId: string;
}

/** Aggregated per-node stats across instances. */
export interface NodeStats {
  nodeId: string;
  executions: number;
  totalMs: number;
  meanMs: number;
  maxMs: number;
  minMs: number;
  /** Share of the process's total elapsed time, [0,1]. */
  shareOfTotal: number;
}

/** Bottleneck report for one process definition. */
export interface BottleneckReport {
  definitionId: string;
  /** Nodes ranked by total time consumed, descending. */
  ranked: NodeStats[];
  /** The single biggest time sink, or null when no data. */
  bottleneck: NodeStats | null;
  /** Total elapsed ms across all timed executions. */
  totalMs: number;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** A resource pool the simulation draws from (e.g. "clerks": 2). */
export interface ResourcePool {
  name: string;
  capacity: number;
}

/** Static step the simulator schedules. */
export interface SimStep {
  nodeId: string;
  /** Deterministic duration used by the simulation. */
  durationMs: number;
  /** Resources the step occupies while running. */
  requires: Record<string, number>;
}

/** Result of a what-if run. */
export interface SimulationResult {
  /** Simulated makespan: start-to-finish under constraints. */
  makespanMs: number;
  /** Per-step scheduled start/finish. */
  schedule: Array<{ nodeId: string; startAt: number; endAt: number }>;
  /** Resource that was the tightest bottleneck (max utilisation). */
  constrainingResource: string | null;
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/** One published version of a process definition. */
export interface DefinitionVersion {
  /** Shared process id, e.g. "order-flow". */
  processId: string;
  /** Monotonic version number (1, 2, 3...). */
  version: number;
  definitionId: string;
  /** Epoch ms this version was published. */
  publishedAt: number;
}
