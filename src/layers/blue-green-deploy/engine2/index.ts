/**
 * BlueGreenDeploy Engine2 — public exports.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

export * from './types';
export { planWaves, waveIndexOf, CycleError, WavePlanError } from './WavePlanner';
export { checkParity } from './ParityChecker';
export { SmokeRunner } from './SmokeRunner';
export { compareWindows } from './TrafficAnalysis';
export type { TrafficPolicy } from './TrafficAnalysis';
export { InstantRollback, RollbackError } from './InstantRollback';
export type { StateRestorer } from './InstantRollback';
export { SwitchOrchestrator } from './SwitchOrchestrator';
export type { SwitchEnvironment, SwitchGate, SwitchOptions, SwitchOutcome } from './SwitchOrchestrator';
export { diffConfigs, summarize } from './ConfigDiffer';
export type { ConfigValue, ConfigDiff, DiffKind } from './ConfigDiffer';
export { TrafficSampler } from './TrafficSampler';
export { WaveExecutor } from './WaveExecutor';
export type { WaveStatus, WaveGate, WaveDeployer, WaveOutcome, ExecutionReport } from './WaveExecutor';
export { CanaryAnalyzer } from './CanaryAnalyzer';
export type { CanaryStep, StepVerdict, CanaryReport } from './CanaryAnalyzer';
export { validate } from './ConfigValidator';
export type { RuleKind, ConfigRule, ValidationIssue } from './ConfigValidator';
