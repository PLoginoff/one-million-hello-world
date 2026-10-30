/**
 * Data Transformation Engine — public surface.
 *
 * @module DataTransformationLayer/Engine
 */

export {
  type AggregateResult,
  type AggregateSpec,
  type BatchResult,
  type CoercionMode,
  type CoerceTarget,
  type ErrorPhase,
  type FoldKind,
  type FoldSpec,
  type ItemResult,
  type JoinSpec,
  type LookupTable,
  type MappingRule,
  type MappingSpec,
  type ConstantRule,
  type TransformError,
  type ValueTransform,
  type ValueValidator,
  isConstantRule,
} from './types';

export {
  parsePath,
  getPath,
  projectPath,
  setPath,
  hasIteration,
  type Path,
  type PathSegment,
} from './Path';

export { Coercer, type CoerceOutcome } from './Coercer';
export {
  BUILTIN_VALIDATORS,
  runValidator,
  allOf,
  anyOf,
  inRange,
  lengthBetween,
  matches,
  oneOf,
  not,
} from './Validators';
export {
  BUILTIN_TRANSFORMS,
  resolveTransform,
  applyTransforms,
  flattenDeep,
  uniqueByIdentity,
} from './Transforms';
export { MappingEngine, type CompiledMapping, type MappingEngineOptions } from './MappingEngine';
export { Enricher } from './Enricher';
export { Aggregator } from './Aggregator';
export { BatchTransformer } from './BatchTransformer';
export {
  TransformationEngine,
  type EngineTransformResult,
  type TransformationEngineOptions,
} from './TransformationEngine';
