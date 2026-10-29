/**
 * Configuration Engine — `${ref}` Interpolation
 *
 * Resolves `${path.to.key}` placeholders inside string values, with support
 * for defaults (`${key:-fallback}`), nesting (a referenced value may itself
 * contain references) and cycle detection.
 *
 * Resolution order at each placeholder:
 *   1. Exact dot-path lookup in the flattened effective config.
 *   2. Environment variable `process.env[REF]` (only when `allowEnv` and the
 *      name is not a dotted path — env vars conventionally use UPPER_SNAKE).
 *   3. `:-default` clause.
 *   4. Unresolved → left in place and reported via `onUnresolved`.
 *
 * Algorithm: iterative substitution with a resolution stack. Each value is
 * expanded at most `maxDepth` times; a reference back to a path already on
 * the stack raises `InterpolationCycleError` with the cycle rendered as
 * `a -> b -> c -> a`. O(values × maxDepth) worst case.
 *
 * @module Configuration/Engine
 */

import { ConfigValue } from './ConfigTypes';

export class InterpolationCycleError extends Error {
  readonly cycle: ReadonlyArray<string>;
  constructor(cycle: ReadonlyArray<string>) {
    super(`interpolation cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'InterpolationCycleError';
    this.cycle = cycle;
  }
}

export interface InterpolatorOptions {
  /** Max nested expansion depth (default 10). */
  readonly maxDepth?: number;
  /** Allow `${VAR}` to fall back to process.env when not a config key. */
  readonly allowEnv?: boolean;
  /** Called for every placeholder that could not be resolved. */
  readonly onUnresolved?: (path: string, placeholder: string) => void;
}

interface Placeholder {
  readonly raw: string;
  readonly key: string;
  readonly defaultValue: string | undefined;
}

const PLACEHOLDER_RE = /\$\{([^{}]+)\}/g;

/** Parse `${key}` or `${key:-default}` bodies. */
function parsePlaceholder(body: string): Placeholder {
  const idx = body.indexOf(':-');
  if (idx === -1) {
    return { raw: `\${${body}}`, key: body.trim(), defaultValue: undefined };
  }
  return {
    raw: `\${${body}}`,
    key: body.slice(0, idx).trim(),
    defaultValue: body.slice(idx + 2),
  };
}

export class ConfigInterpolator {
  private readonly _maxDepth: number;
  private readonly _allowEnv: boolean;
  private readonly _onUnresolved: ((path: string, placeholder: string) => void) | undefined;
  private readonly _env: (name: string) => string | undefined;

  constructor(
    options: InterpolatorOptions = {},
    envLookup: (name: string) => string | undefined = (n) =>
      typeof process !== 'undefined' ? process.env[n] : undefined
  ) {
    this._maxDepth = options.maxDepth ?? 10;
    this._allowEnv = options.allowEnv ?? true;
    this._onUnresolved = options.onUnresolved;
    this._env = envLookup;
  }

  /** True when the string contains at least one `${...}` placeholder. */
  static hasPlaceholders(value: string): boolean {
    PLACEHOLDER_RE.lastIndex = 0;
    return PLACEHOLDER_RE.test(value);
  }

  /**
   * Resolve every placeholder in `value` against `lookup` — a function that
   * maps a dot-path to its effective ConfigValue (typically
   * `config.get(path)`). `selfPath` is the path of the value itself, used for
   * cycle detection (a key referencing itself is a cycle of length 1).
   */
  resolve(value: string, lookup: (path: string) => ConfigValue | undefined, selfPath: string): string {
    return this._expand(value, lookup, [selfPath], 0);
  }

  /**
   * Post-pass over a flat map of path → value: resolves every string leaf in
   * place, returning a NEW map. Runs values in a stable order so the report
   * of unresolved placeholders is deterministic.
   */
  resolveAll(flat: ReadonlyMap<string, ConfigValue>): Map<string, ConfigValue> {
    const out = new Map<string, ConfigValue>();
    const lookup = (path: string): ConfigValue | undefined => {
      // Prefer already-resolved values so `${a}` inside `${b}` sees
      // expansions when keys are processed in dependency order — but fall
      // back to the raw map (nested references expand recursively anyway).
      const resolved = out.get(path);
      if (resolved !== undefined) return resolved;
      return flat.get(path);
    };
    for (const [path, v] of flat) {
      if (typeof v === 'string' && ConfigInterpolator.hasPlaceholders(v)) {
        out.set(path, this._expand(v, lookup, [path], 0));
      } else {
        out.set(path, v);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ private

  private _expand(
    value: string,
    lookup: (path: string) => ConfigValue | undefined,
    stack: string[],
    depth: number
  ): string {
    if (depth > this._maxDepth) {
      this._onUnresolved?.(stack[stack.length - 1], value);
      return value;
    }
    PLACEHOLDER_RE.lastIndex = 0;
    return value.replace(PLACEHOLDER_RE, (rawMatch, body: string) => {
      const ph = parsePlaceholder(body);
      if (stack.includes(ph.key)) {
        throw new InterpolationCycleError([...stack, ph.key]);
      }
      const ref = lookup(ph.key);
      let resolved: string | undefined;
      if (ref !== undefined && ref !== null) {
        if (typeof ref === 'string') {
          // Recursively expand nested references with the cycle stack extended.
          resolved = this._expand(ref, lookup, [...stack, ph.key], depth + 1);
        } else if (typeof ref === 'number' || typeof ref === 'boolean') {
          resolved = String(ref);
        } else {
          // Object/array values can't be embedded into a string.
          this._onUnresolved?.(stack[stack.length - 1], rawMatch);
          resolved = undefined;
        }
      } else if (this._allowEnv && !ph.key.includes('.')) {
        const envVal = this._env(ph.key);
        resolved = envVal !== undefined ? envVal : ph.defaultValue;
      } else {
        resolved = ph.defaultValue;
      }
      if (resolved === undefined) {
        this._onUnresolved?.(stack[stack.length - 1], rawMatch);
        return rawMatch;
      }
      return resolved;
    });
  }
}
