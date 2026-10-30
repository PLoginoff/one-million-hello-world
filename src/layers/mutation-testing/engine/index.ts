/**
 * Mutation Testing Engine — public surface.
 *
 * Token-level TypeScript-like parser, classic mutation operators,
 * kill-evaluation through a pluggable test runner, mutation scoring,
 * surviving-mutant diffs and incremental (changed-file-only) runs.
 *
 * @module MutationTesting/Engine
 */

export {
  tokenize,
  parse,
  walk,
  findNodes,
  emitNode,
} from './CodeModel';
export type {
  Token,
  TokenKind,
  TSNode,
  NodeKind,
  TUProgram,
} from './CodeModel';

export {
  defaultOperators,
  generateMutants,
  makeSpec,
  ArithmeticOperatorMutation,
  RelationalOperatorMutation,
  ConditionalBoundaryMutation,
  LogicalOperatorMutation,
  NegationMutation,
  BooleanLiteralMutation,
  NullLiteralMutation,
  NumericLiteralMutation,
  StringLiteralMutation,
  IncrementDecrementMutation,
  LoopBoundMutation,
  ReturnValueMutation,
  ArrayIndexMutation,
  AssignmentOperatorMutation,
  EqualityToAssignmentMutation,
  StatementRemovalMutation,
} from './MutationOperators';
export type { MutantSpec, MutationOperator } from './MutationOperators';

export {
  MutationEngine,
  IncrementalMutationRunner,
  FunctionTestRunner,
} from './MutationEngine';
export type {
  TestRunner,
  TestRunResult,
  TestOutcome,
  MutantStatus,
  MutantResult,
  MutationReport,
  FileMutationSummary,
  MutationEngineOptions,
} from './MutationEngine';

export {
  Interpreter,
  InterpretedTestRunner,
  RuntimeEvalError,
} from './MutantInterpreter';
export type { Rt, InterpretedCase } from './MutantInterpreter';

export {
  CoverageMatrix,
  EquivalentMutantDetector,
  MutationScoreTrend,
  MutationEfficiency,
} from './MutationAnalysis';
export type {
  ScorePoint,
  OperatorStats,
} from './MutationAnalysis';
