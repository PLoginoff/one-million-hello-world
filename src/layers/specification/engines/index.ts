/**
 * Specification Engines — public surface.
 *
 * Real specification-pattern implementation: base Specification with
 * composable And/Or/Not, leaf spec library, SQL + description
 * renderers, candidate scoring, parameterized templates, and JSON
 * serialization with a custom-spec registry.
 */

export {
  SpecOp,
  isLeafNode,
  isLogicNode,
  isNotNode,
  isCustomNode,
} from './types';
export type {
  ISpecification,
  SpecSql,
  SpecNode,
  SpecLeaf,
  SpecLogic,
  SpecNot,
  SpecCustom,
  CandidateScore,
  LeafVerdict,
  SpecFactory,
} from './types';

export {
  Specification as BaseSpecification,
  AndSpec,
  OrSpec,
  NotSpec,
  PredicateSpec,
  evalNode,
  evalLeaf,
  resolveField,
  nodeSql,
  nodeDescription,
} from './Specification';

export { leafSql, leafDescription, remapPlaceholders } from './renderers';

export {
  Equal,
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  In,
  NotIn,
  Contains,
  StartsWith,
  EndsWith,
  Matches,
  Between,
  IsNull,
  IsNotNull,
  TrueSpec,
  FalseSpec,
} from './CommonSpecs';

export { CandidateSelector } from './CandidateSelector';

export {
  serializeNode,
  deserializeNode,
  specToJson,
  specFromJson,
  specFromNode,
  SpecRegistry,
} from './serialization';

export { ParameterizedSpec, parameterizedFromSpec, paramNames } from './ParameterizedSpec';
