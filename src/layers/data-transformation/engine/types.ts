/**
 * Transformation Engine Types
 *
 * Shared contracts for the data-transformation engine: the declarative
 * mapping DSL, coercion semantics, validation, lookup-table enrichment,
 * group-by aggregation, and per-item batch error collection.
 *
 * DSL model — a MappingSpec is a list of MappingRules. Each rule names a
 * `source` path (dot/bracket notation: "a.b[0].c", "items[].name"), a
 * `target` path, and optional stages applied in order:
 *   validate → coerce → transform → (required check)
 * Array flattening/unflattening is expressed through the same path
 * notation: a `[]` segment in source iterates elements; a `[i]` or `[]`
 * segment in target places values into an array.
 *
 * @module DataTransformationLayer/Engine
 */

/**
 * Coercion strictness.
 *
 * - strict: only lossless coercions; anything ambiguous produces a
 *   TransformError (e.g. "abc"→number fails, "12x"→number fails).
 * - lenient: best-effort coercions; uncoercible input maps to the rule's
 *   `default` or to a documented lenient fallback (NaN→0, bad date→epoch).
 */
export type CoercionMode = 'strict' | 'lenient';

/**
 * Where in the pipeline an error occurred.
 */
export type ErrorPhase = 'validate' | 'coerce' | 'transform' | 'required' | 'shape';

/**
 * A single transformation failure, tied to a rule and input value.
 */
export interface TransformError {
  readonly rule: string;
  readonly phase: ErrorPhase;
  readonly message: string;
  readonly sourceValue?: unknown;
}

/**
 * Per-item result in batch mode — either `output` or `errors` is set.
 */
export interface ItemResult<O = unknown> {
  readonly index: number;
  readonly ok: boolean;
  readonly output?: O;
  readonly errors: readonly TransformError[];
}

/**
 * Aggregate batch result. `successes + failures === total` always.
 */
export interface BatchResult<O = unknown> {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly items: readonly ItemResult<O>[];
}

/**
 * Primitive coercion targets.
 */
export type CoerceTarget =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'iso-date'
  | 'array'
  | 'object';

/**
 * Value transform applied after coercion — named builtins or an inline fn.
 */
export type ValueTransform =
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'abs'
  | 'floor'
  | 'ceil'
  | 'round'
  | 'negate'
  | 'json'
  | 'parseJson'
  | 'first'
  | 'last'
  | 'count'
  | 'keys'
  | 'values'
  | 'flatten'
  | 'unique'
  | ((value: unknown) => unknown);

/**
 * Validation applied before coercion.
 */
export type ValueValidator =
  | 'required'
  | 'nonEmpty'
  | 'isString'
  | 'isNumber'
  | 'isInteger'
  | 'isBoolean'
  | 'isArray'
  | 'isObject'
  | 'isDateString'
  | 'positive'
  | 'nonNegative'
  | ((value: unknown) => boolean | string);

/**
 * One declarative mapping rule.
 */
export interface MappingRule {
  /** Source path, dot/bracket notation. `[]` iterates arrays. */
  readonly source: string;
  /** Target path written into the output object. */
  readonly target: string;
  /** Fail the item when the source resolves to undefined/null. */
  readonly required?: boolean;
  /** Pre-coercion validators; first failure wins. */
  readonly validate?: readonly ValueValidator[];
  /** Type coercion applied to the resolved value. */
  readonly coerce?: CoerceTarget;
  /** Post-coercion value transforms, applied left-to-right. */
  readonly transform?: ValueTransform | readonly ValueTransform[];
  /** Fallback when source is missing/undefined (also lenient-mode fallback). */
  readonly default?: unknown;
}

/**
 * Literal fields written verbatim into every output object.
 */
export interface ConstantRule {
  readonly target: string;
  readonly value: unknown;
}

/**
 * Declarative mapping specification — the engine's input DSL.
 */
export interface MappingSpec {
  readonly rules: readonly (MappingRule | ConstantRule)[];
}

/**
 * Type guard: distinguishes a constant rule from a mapping rule.
 */
export function isConstantRule(rule: MappingRule | ConstantRule): rule is ConstantRule {
  return 'value' in rule && !('source' in rule);
}

/**
 * A lookup table for enrichment joins: key → enrichment record.
 */
export interface LookupTable {
  readonly name: string;
  readonly records: Readonly<Record<string, Record<string, unknown>>>;
}

/**
 * Declarative join: read `keyPath` from the item, look it up in the table,
 * and merge/place the matching record at `target` (or merge into root).
 */
export interface JoinSpec {
  readonly table: LookupTable;
  /** Path in the source item holding the join key. */
  readonly keyPath: string;
  /**
   * Where to write the joined record. When omitted the record's fields are
   * merged into the item root (a "denormalize" join). `"as"` writes the
   * whole record under that path.
   */
  readonly target?: string;
  /** What to do when the key has no matching record. Default 'skip'. */
  readonly onMissing?: 'skip' | 'null' | 'error';
}

/**
 * Aggregation: group input items by `groupBy` path, then fold each group
 * with `folds`. Output is an array of group result objects.
 */
export interface AggregateSpec {
  /** Path whose value forms the group key (stringified). */
  readonly groupBy: string;
  readonly folds: readonly FoldSpec[];
}

/**
 * One fold over a group — reduces the group's values at `source` into a
 * single accumulator written at `target`.
 */
export interface FoldSpec {
  /** Path inside each item to fold over (empty string = whole item). */
  readonly source: string;
  /** Field name in the group output object. */
  readonly target: string;
  readonly fold: FoldKind;
  /** Seed for 'custom' folds / initial accumulator. */
  readonly initial?: unknown;
}

export type FoldKind =
  | 'count'
  | 'sum'
  | 'min'
  | 'max'
  | 'avg'
  | 'first'
  | 'last'
  | 'collect'
  | 'concat'
  | { readonly op: (acc: unknown, value: unknown) => unknown };

/**
 * Structured output of the aggregation engine.
 */
export interface AggregateResult {
  readonly groups: ReadonlyArray<Record<string, unknown>>;
  readonly groupCount: number;
  readonly inputCount: number;
}
