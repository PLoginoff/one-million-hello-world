/**
 * Property Testing Engine — public surface.
 *
 * Seeded arbitraries with lazy shrink trees, greedy counterexample
 * minimization, deterministic seeded runs, built-in property templates,
 * and model-based stateful testing with trace shrinking.
 *
 * @module PropertyTesting/Engine
 */

export {
  mulberry32,
  deriveSeed,
  shrinkToMinimal,
  leaf,
  mapArbitrary,
  filterArbitrary,
  constant,
  int,
  float,
  boolean,
  string,
  array,
  tuple,
  record,
  oneOf,
  frequency,
  recursive,
  jsonValue,
} from './Arbitrary';
export type {
  Arbitrary,
  ShrinkTree,
  IntOptions,
  FloatOptions,
  StringOptions,
  ArrayOptions,
  ObjectOptions,
} from './Arbitrary';

export {
  property,
  checkProperty,
  replay,
  suiteSeed,
  roundtripProperty,
  invariantProperty,
  idempotenceProperty,
  commutativeProperty,
  associativeProperty,
  PropertyRunner,
} from './PropertyRunner';
export type {
  Property,
  PropertyPredicate,
  PropertyReport,
  PropertyFailure,
  PropertyOptions,
  PropertyStatus,
} from './PropertyRunner';

export {
  alpha,
  alphaNum,
  ascii,
  unicode,
  email,
  ipv4,
  isoDate,
  uuid,
  noShrink,
  limitShrink,
  sample,
  sampleTrees,
  checkWithStats,
  forAll,
  CounterexampleDb,
} from './GenUtils';

export { Gen, genRecord, genTuple } from './Gen';
export type {
  ClassifiedReport,
  StoredCounterexample,
} from './GenUtils';

export {
  cmd,
  generateSequence,
  replaySequence,
  shrinkTrace,
  checkStateful,
} from './StatefulTesting';
export type {
  Command,
  Model,
  Trace,
  TraceStep,
  StepResult,
  ReplayReport,
  SequenceOptions,
  StatefulCheckOptions,
  StatefulReport,
} from './StatefulTesting';
