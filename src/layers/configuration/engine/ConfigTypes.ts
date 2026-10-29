/**
 * Configuration Engine — Core Types
 *
 * Shared types for the layered configuration engine: sources, precedence,
 * schema rules, change events, interpolation and freeze snapshots.
 *
 * @module Configuration/Engine
 */

/** Injectable clock — returns epoch milliseconds. */
export type ConfigClock = () => number;

/**
 * A configuration tree. Values at the leaves are scalars (string, number,
 * boolean, null) or nested objects / arrays. Arrays are treated as atomic
 * leaf values during merge (whole-array replacement).
 */
export type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue };
export type ConfigObject = { [key: string]: ConfigValue };

/** Type guard for a plain (non-array) config object. */
export function isConfigObject(v: ConfigValue | undefined): v is ConfigObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Ordered precedence tiers, lowest to highest. */
export enum ConfigPrecedence {
  DEFAULTS = 0,
  FILE = 1,
  ENV = 2,
  REMOTE = 3,
  OVERRIDE = 4,
}

export const PRECEDENCE_ORDER: ReadonlyArray<ConfigPrecedence> = [
  ConfigPrecedence.DEFAULTS,
  ConfigPrecedence.FILE,
  ConfigPrecedence.ENV,
  ConfigPrecedence.REMOTE,
  ConfigPrecedence.OVERRIDE,
];

/**
 * One flat layer of configuration. Keys are dot-separated paths
 * (`database.primary.host`). `precedence` decides the order in which layers
 * are folded into the effective tree.
 */
export interface ConfigLayer {
  readonly name: string;
  readonly precedence: ConfigPrecedence;
  /** Flat map of dot-path → value. */
  readonly entries: Readonly<Record<string, ConfigValue>>;
  /** Environment names this layer applies to; empty = all environments. */
  readonly environments?: ReadonlyArray<string>;
}

/**
 * A configuration source produces a ConfigLayer. Sources may be polled by
 * the hot-reload engine — `load()` must be side-effect free and deterministic
 * for a given backing state.
 */
export interface ConfigSource {
  readonly name: string;
  readonly precedence: ConfigPrecedence;
  load(): Promise<Record<string, ConfigValue>> | Record<string, ConfigValue>;
}

/** A single path-level change between two effective configs. */
export interface ConfigChange {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'modified';
  readonly oldValue: ConfigValue | undefined;
  readonly newValue: ConfigValue | undefined;
  /** Names of the source layers that contributed to the change. */
  readonly sources: ReadonlyArray<string>;
}

/** Result of a hot-reload diff. */
export interface ConfigDiff {
  readonly changes: ReadonlyArray<ConfigChange>;
  readonly at: number;
  readonly changed: boolean;
}

/** Severity buckets for validation findings. */
export type SchemaViolationKind = 'type' | 'required' | 'enum' | 'pattern' | 'range' | 'custom' | 'frozen';

export interface SchemaViolation {
  readonly path: string;
  readonly kind: SchemaViolationKind;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
}

/**
 * A path-based validation rule. `path` supports `*` (one segment) and `**`
 * (any segments) wildcards — e.g. `servers.*.port`.
 */
export interface SchemaRule {
  readonly path: string;
  readonly type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly required?: boolean;
  /** Allowed literal values. */
  readonly enum?: ReadonlyArray<ConfigValue>;
  /** Regex the (string-coerced) value must match. */
  readonly pattern?: RegExp;
  /** Numeric bounds, inclusive. */
  readonly min?: number;
  readonly max?: number;
  /** Custom predicate; return a string message on failure, true on pass. */
  readonly validate?: (value: ConfigValue, path: string) => true | string;
}

/** Listener invoked after a reload produces a validated effective config. */
export type ConfigChangeListener = (diff: ConfigDiff, config: EffectiveConfig) => void;

/** The merged, validated view of the world. */
export interface EffectiveConfig {
  /** Effective value at `path`, or `undefined` when absent. */
  get(path: string): ConfigValue | undefined;
  /** Effective value coerced to string; throws when missing and no fallback. */
  getString(path: string, fallback?: string): string;
  getNumber(path: string, fallback?: number): number;
  getBoolean(path: string, fallback?: boolean): boolean;
  /** All flattened paths in insertion order. */
  paths(): ReadonlyArray<string>;
  /** Flat path → value map (defensive copy). */
  flatten(): Record<string, ConfigValue>;
  /** Which layer supplied the winning value for `path`. */
  origin(path: string): string | undefined;
  /** Serialize; secret paths are masked. */
  toJSON(maskSecrets?: boolean): ConfigObject;
}

/** An immutable point-in-time capture of an EffectiveConfig. */
export interface ConfigSnapshot {
  readonly id: number;
  readonly takenAt: number;
  readonly config: EffectiveConfig;
  readonly diffFromPrevious: ConfigDiff;
}
