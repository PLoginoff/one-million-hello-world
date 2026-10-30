/**
 * Contract Testing Engine — public surface.
 *
 * Consumer-driven contracts, pact-style matching, provider verification,
 * registry/discovery, version-compatibility analysis, pact-format
 * serialization, and a fluent contract DSL.
 *
 * @module ContractTesting/Engine
 */

export {
  MatcherSet,
  matchValue,
  evaluateMatcher,
  structuralDiff,
  formatDiff,
  parsePath,
  renderPath,
  deepEqual,
  isJson,
  asJson,
  jsonTypeOf,
} from './ContractMatchers';
export type {
  Json,
  MatchingRule,
  MatcherKind,
  MatchMismatch,
  MatchResult,
  DiffEntry,
  DiffKind,
  PathSegment,
} from './ContractMatchers';

export {
  ContractBuilder,
  ContractRegistry,
  ProviderVerifier,
  parseSemver,
  formatSemver,
  compareSemver,
} from './ContractRegistry';
export type {
  Contract,
  ContractInteraction,
  ContractRequest,
  ContractResponse,
  HttpMethod,
  Semver,
  PublishOptions,
  ProviderHandler,
  ProviderStateHandler,
  InteractionVerification,
  VerificationReport,
} from './ContractRegistry';

export {
  ContractCompatibilityAnalyzer,
  CompatibilityMatrix,
  inferShape,
} from './CompatibilityMatrix';
export type {
  ContractChange,
  ChangeSeverity,
  CompatibilityReport,
  CompatibilityCell,
} from './CompatibilityMatrix';

export {
  toPactDocument,
  fromPactDocument,
  MockProvider,
  VerificationStore,
  versionSatisfies,
} from './ContractBroker';
export type {
  PactDocument,
  PactInteraction,
  MockHit,
  MockMiss,
  VerificationRecord,
} from './ContractBroker';

export {
  contractDsl,
  ContractDsl,
  like,
  eachLike,
  regex,
  integer,
  decimal,
  bool,
  iso8601,
  uuidLike,
  arrayLength,
  httpProviderHandler,
} from './ContractDsl';
export type { MatcherMarker, FetchLike } from './ContractDsl';
