/**
 * Data Lineage Engine — public surface.
 *
 * Typed lineage DAG over datasets/jobs/columns with expression-aware
 * column propagation, impact analysis, cycle detection and serialization.
 *
 * @module DataLineage/Engine
 */

export { GraphCaptureHook, LineageGraph, extractColumnRefs } from './LineageGraphEngine';

export { LineageQuery, RootCauseAnalyzer } from './LineageQuery';

export { SqlLineageExtractor, parseSelect } from './SqlLineageExtractor';
export type { ExtractionResult, ParsedSelect } from './SqlLineageExtractor';
export type {
  NodeFilter,
  RootCauseCandidate,
  RootCauseReport,
  SubgraphOptions,
} from './LineageQuery';

export { LineageStore, cloneGraph } from './LineageStore';
export type {
  GraphDiff,
  LineageDelta,
  LineageVersion,
} from './LineageStore';
export type {
  ColumnRef,
  CyclePath,
  ImpactReport,
  LineageCaptureHook,
  LineageEdge,
  LineageEdgeKind,
  LineageNode,
  LineageNodeKind,
  NodeId,
  TraversalResult,
} from './LineageGraphEngine';
