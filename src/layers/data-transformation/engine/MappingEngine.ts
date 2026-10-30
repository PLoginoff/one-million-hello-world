/**
 * MappingEngine
 *
 * Core of the transformation layer: compiles a declarative `MappingSpec`
 * into a reusable `CompiledMapping` — an optimized closure evaluated per
 * item — and executes it with strict/lenient coercion, validation,
 * defaults, required-field checks, and array flatten/unflatten through the
 * `[]` path notation.
 *
 * Compilation happens once (`compile()`); the returned closure captures
 * parsed paths and resolved transform fns so per-item work is O(rules ×
 * path depth) with zero re-parsing — the "compile DSL → optimized closure,
 * reuse many times" contract.
 *
 * Per-rule pipeline (inside the closure):
 *   1. resolve source path (project for `[]` paths)
 *   2. missing/undefined → required check → default
 *   3. run validators (phase 'validate')
 *   4. coerce (phase 'coerce')
 *   5. apply value transforms (phase 'transform')
 *   6. write at target path (scalar set, or append for `[]` targets)
 *
 * Error policy: rules collect into `errors[]`; a mapping is "ok" only when
 * zero errors accumulated. In strict mode the first error still records
 * subsequent rule errors (full per-item diagnosis, not fail-fast) —
 * fail-fast is available via `collectErrors=false` if desired.
 *
 * @module DataTransformationLayer/Engine
 */

import { Coercer } from './Coercer';
import { getPath, parsePath, projectPath, setPath, hasIteration, Path } from './Path';
import { applyTransforms } from './Transforms';
import { runValidator } from './Validators';
import {
  CoercionMode,
  isConstantRule,
  MappingRule,
  MappingSpec,
  TransformError,
  ValueValidator,
} from './types';

/**
 * A pre-compiled mapping: pure function item → {output, errors}.
 */
export type CompiledMapping = (
  item: Record<string, unknown>
) => { output: Record<string, unknown>; errors: TransformError[] };

/**
 * Engine-level options.
 */
export interface MappingEngineOptions {
  readonly coercionMode?: CoercionMode;
}

/**
 * One internalized rule with parsed paths and resolved transforms.
 */
interface PreparedRule {
  readonly kind: 'map' | 'const';
  readonly sourcePath?: Path;
  readonly sourceIterates: boolean;
  readonly targetPath: Path;
  readonly targetIterates: boolean;
  readonly required: boolean;
  readonly validators: readonly ValueValidator[];
  readonly coerce?: import('./types').CoerceTarget;
  readonly transforms: import('./types').ValueTransform | readonly import('./types').ValueTransform[] | undefined;
  readonly hasDefault: boolean;
  readonly defaultValue: unknown;
  readonly constValue?: unknown;
  readonly label: string;
}

export class MappingEngine {
  private readonly _coercer: Coercer;
  private readonly _mode: CoercionMode;

  constructor(options: MappingEngineOptions = {}) {
    this._mode = options.coercionMode ?? 'strict';
    this._coercer = new Coercer(this._mode);
  }

  get mode(): CoercionMode {
    return this._mode;
  }

  /**
   * Compiles a spec into a reusable mapping closure. Parse/validation of
   * the spec itself (bad paths, unknown transforms) happens here — once —
   * so per-item evaluation never pays that cost.
   */
  compile(spec: MappingSpec): CompiledMapping {
    const prepared = spec.rules.map((rule) => this.prepare(rule));
    const mode = this._mode;
    const coercer = this._coercer;

    return (item: Record<string, unknown>) => {
      const output: Record<string, unknown> = {};
      const errors: TransformError[] = [];

      for (const rule of prepared) {
        if (rule.kind === 'const') {
          writeValue(output, rule.targetPath, rule.targetIterates, rule.constValue);
          continue;
        }

        // -- resolve ---------------------------------------------------
        const sourcePath = rule.sourcePath as Path;
        const raw = rule.sourceIterates ? projectPath(item, sourcePath) : getPath(item, sourcePath);
        let value = raw;

        // -- required / default -----------------------------------------
        const missing = raw === undefined || raw === null || (rule.sourceIterates && Array.isArray(raw) && raw.length === 0);
        if (missing) {
          if (rule.required) {
            errors.push({
              rule: rule.label,
              phase: 'required',
              message: `required source '${rule.label}' is missing`,
              sourceValue: raw,
            });
            continue;
          }
          if (rule.hasDefault) {
            value = rule.defaultValue;
          } else if (mode === 'strict' && raw === undefined) {
            // strict: a missing optional field is simply skipped; lenient
            // also skips — absence is not an error either way.
            continue;
          } else {
            continue;
          }
        }

        // -- validate ----------------------------------------------------
        let failed = false;
        for (const validator of rule.validators) {
          const reason = runValidator(validator, value);
          if (reason !== null) {
            errors.push({
              rule: rule.label,
              phase: 'validate',
              message: reason,
              sourceValue: value,
            });
            failed = true;
            break;
          }
        }
        if (failed) {
          continue;
        }

        // -- coerce ------------------------------------------------------
        if (rule.coerce) {
          // iterate-sourced arrays coerce element-wise; scalars coerce whole
          if (rule.sourceIterates && Array.isArray(value)) {
            const coerced: unknown[] = [];
            let coerceFailed = false;
            for (const el of value) {
              const outcome = coercer.coerce(el, rule.coerce, rule.label, rule.defaultValue);
              if (!outcome.ok) {
                if (mode === 'strict') {
                  errors.push(outcome.error);
                  coerceFailed = true;
                  break;
                }
                coerced.push(rule.defaultValue);
              } else {
                coerced.push(outcome.value);
              }
            }
            if (coerceFailed) {
              continue;
            }
            value = coerced;
          } else {
            const outcome = coercer.coerce(value, rule.coerce, rule.label, rule.defaultValue);
            if (!outcome.ok) {
              if (mode === 'strict') {
                errors.push(outcome.error);
                continue;
              }
              value = rule.defaultValue;
            } else {
              value = outcome.value;
            }
          }
        }

        // -- transform ---------------------------------------------------
        try {
          value = applyTransforms(value, rule.transforms);
        } catch (error) {
          errors.push({
            rule: rule.label,
            phase: 'transform',
            message: error instanceof Error ? error.message : String(error),
            sourceValue: value,
          });
          continue;
        }

        // -- write -------------------------------------------------------
        try {
          writeValue(output, rule.targetPath, rule.targetIterates, value);
        } catch (error) {
          errors.push({
            rule: rule.label,
            phase: 'shape',
            message: error instanceof Error ? error.message : String(error),
            sourceValue: value,
          });
        }
      }

      return { output, errors };
    };
  }

  /**
   * One-shot convenience: compile + apply to a single item.
   */
  map(item: Record<string, unknown>, spec: MappingSpec): { output: Record<string, unknown>; errors: TransformError[] } {
    return this.compile(spec)(item);
  }

  // -------------------------------------------------------------------

  private prepare(rule: MappingRule | import('./types').ConstantRule): PreparedRule {
    if (isConstantRule(rule)) {
      const targetPath = parsePath(rule.target);
      return {
        kind: 'const',
        targetPath,
        targetIterates: hasIteration(targetPath),
        required: false,
        validators: [],
        coerce: undefined,
        transforms: undefined,
        hasDefault: false,
        defaultValue: undefined,
        constValue: rule.value,
        sourceIterates: false,
        label: `const:${rule.target}`,
      };
    }
    const sourcePath = parsePath(rule.source);
    const targetPath = parsePath(rule.target);
    return {
      kind: 'map',
      sourcePath,
      sourceIterates: hasIteration(sourcePath),
      targetPath,
      targetIterates: hasIteration(targetPath),
      required: rule.required ?? false,
      validators: rule.validate ?? [],
      coerce: rule.coerce,
      transforms: rule.transform,
      hasDefault: 'default' in rule,
      defaultValue: rule.default,
      label: rule.source,
    };
  }
}

/**
 * Writes a value at a target path. For `[]`-bearing targets the value is
 * appended element-wise when it is an array produced by an iterate source,
 * or appended as a single element otherwise — this is the asymmetry that
 * makes flatten (`orders[].x`→`xs[]`) and unflatten (`xs[]`→`orders[].x`)
 * both work: the writer only sees the resolved value, so array values
 * always expand into `[]` targets.
 */
function writeValue(
  output: Record<string, unknown>,
  targetPath: Path,
  targetIterates: boolean,
  value: unknown
): void {
  if (!targetIterates) {
    setPath(output, targetPath, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const el of value) {
      setPath(output, targetPath, el);
    }
  } else {
    setPath(output, targetPath, value);
  }
}
