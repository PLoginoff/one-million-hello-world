/**
 * Configuration Engine — public exports.
 */

export * from './ConfigTypes';
export { MergedConfig, ConfigMerger, deepMerge, getPath as mergeGetPath, flattenTree, valueEquals } from './ConfigMerger';
export { SecretMasker, pathPatternToRegex } from './SecretMasker';
export type { SecretMaskOptions } from './SecretMasker';
export { ConfigInterpolator, InterpolationCycleError } from './ConfigInterpolator';
export type { InterpolatorOptions } from './ConfigInterpolator';
export { ConfigSchema, pathDepth } from './ConfigSchema';
export { ConfigDiffEngine } from './ConfigDiffEngine';
export {
  ConfigEngine,
  FrozenConfigError,
  ConfigValidationError,
  deepFreeze,
  layerFromObject,
  hasPath,
} from './ConfigEngine';
export type { ConfigEngineOptions, ReloadResult } from './ConfigEngine';
export {
  ObjectConfigSource,
  EnvConfigSource,
  FileConfigSource,
  coerceEnvValue,
  fingerprintEntries,
  stableStringify,
} from './ConfigSources';
export type { EnvSourceOptions, FileSourceOptions } from './ConfigSources';
export { ConfigWatcher } from './ConfigWatcher';
export type { WatcherOptions } from './ConfigWatcher';
export { ConfigLinter, entropy } from './ConfigLinter';
export type { LintFinding, LintOptions, LintSeverity } from './ConfigLinter';
