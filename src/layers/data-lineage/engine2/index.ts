/**
 * Data Lineage — Engine2 public surface.
 *
 * Depth-bounded ranked impact analysis, path search between datasets,
 * semantic graph diffing, and transform-classified column propagation.
 *
 * @module DataLineage/Engine2
 */

export { Criticality, ImpactAnalyzer } from './ImpactAnalysis';
export type {
  ImpactConfig,
  ImpactRing,
  ImpactedNode,
  ImpactReport2,
  KindBreakdown,
} from './ImpactAnalysis';

export { LineageSearch } from './LineageSearch';
export type { LineagePath, SearchDirection, SearchOptions } from './LineageSearch';

export { LineageDiffer } from './LineageDiff';
export type { AffectedPipeline, RewiredEdge, SemanticDiff } from './LineageDiff';

export { classifyExpression, ColumnPropagator, TransformKind } from './ColumnPropagation';
export type {
  ColumnLineageEdge,
  ColumnPropagationResult,
  ExpressionShape,
} from './ColumnPropagation';
