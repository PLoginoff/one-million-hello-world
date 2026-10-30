/**
 * Request Body Reshaper
 *
 * Applies a set of copy/move rules — each a compiled JMESPath-like query
 * writing into a dotted destination path — to produce a new JSON body.
 * Rules run in declaration order; later rules can read values earlier
 * rules wrote (the working copy is the document being built AND the
 * source being queried, like a staging area). Pass `isolateSource` to
 * keep source reads pointing at the original body instead.
 *
 * Complexity: O(R × P) where R = rules, P = path depth — the query
 * engine dominates at O(result size) per rule.
 *
 * @module ApiGatewayLayer/Engine2
 */

import { CompiledQuery } from './JsonPathQuery';
import {
  JsonValue,
  JsonObject,
  ReshapeRule,
  ReshapeResult,
  isJsonObject,
} from './types';

/** Deep-clone a JSON tree (values are immutable inputs to callers). */
export function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isJsonObject(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) out[k] = cloneJson(v);
    return out;
  }
  return value;
}

function splitPath(path: string): string[] {
  return path.split('.').filter((p) => p.length > 0);
}

/** Write `value` at a dotted path inside `root`, creating objects as needed. */
function setPath(root: JsonObject, path: readonly string[], value: JsonValue): void {
  if (path.length === 0) return;
  let cur: JsonObject = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    if (!isJsonObject(next)) {
      const fresh: JsonObject = {};
      cur[key] = fresh;
      cur = fresh;
    } else {
      cur = next;
    }
  }
  cur[path[path.length - 1]] = value;
}

/** Remove the leaf at a dotted path; prunes objects left empty. */
function deletePath(root: JsonObject, path: readonly string[]): void {
  if (path.length === 0) return;
  const stack: JsonObject[] = [root];
  for (let i = 0; i < path.length - 1; i++) {
    const next = stack[stack.length - 1][path[i]];
    if (!isJsonObject(next)) return;
    stack.push(next);
  }
  delete stack[stack.length - 1][path[path.length - 1]];
  // Prune ancestors that became empty — walk back up the spine.
  for (let i = path.length - 2; i >= 0; i--) {
    const obj = stack[i][path[i]];
    if (isJsonObject(obj) && Object.keys(obj).length === 0) {
      delete stack[i][path[i]];
    } else {
      break;
    }
  }
}

export interface BodyReshaperOptions {
  /**
   * When true, `from` queries read only the original input body.
   * When false (default), reads consult the original body first and
   * fall back to the working copy, so earlier rules can feed later
   * ones (staging semantics) while projections still see the input.
   */
  readonly isolateSource?: boolean;
  /**
   * When true, the output starts as a deep clone of the input and rules
   * overwrite paths; when false (default) the output starts empty and
   * only `to` paths are populated (strict projection mode).
   */
  readonly passthrough?: boolean;
}

interface CompiledRule {
  readonly query: CompiledQuery;
  readonly to: readonly string[];
  readonly fromPath: readonly string[];
  readonly hasDefault: boolean;
  readonly defaultValue?: JsonValue;
  readonly move: boolean;
  readonly declaredFrom: string;
}

/**
 * A reusable reshaping plan: compile rules once, apply to many bodies.
 */
export class BodyReshaper {
  private readonly _rules: CompiledRule[];
  private readonly _options: BodyReshaperOptions;

  constructor(rules: readonly ReshapeRule[], options?: BodyReshaperOptions) {
    this._options = options ?? {};
    this._rules = rules.map((r) => ({
      query: new CompiledQuery(r.from),
      to: splitPath(r.to),
      fromPath: splitPath(r.from.split('|')[0].trim()), // best-effort for move cleanup
      hasDefault: r.defaultValue !== undefined,
      defaultValue: r.defaultValue,
      move: r.move ?? false,
      declaredFrom: r.from,
    }));
  }

  /**
   * Apply every rule to `body` and return the reshaped result.
   * Input is never mutated — the working copy is a deep clone.
   */
  reshape(body: JsonValue): ReshapeResult {
    const working: JsonObject = this._options.passthrough
      ? (cloneJson(body) as JsonObject)
      : {};
    const moved: string[] = [];
    const missing: string[] = [];

    for (const rule of this._rules) {
      let value = rule.query.evaluate(body);
      // Staging fallback: a rule may read a path an earlier rule wrote.
      if (value === undefined && !this._options.isolateSource) {
        value = rule.query.evaluate(working);
      }
      const resolved = value === undefined && rule.hasDefault ? rule.defaultValue : value;
      if (resolved === undefined) {
        missing.push(rule.declaredFrom);
        continue;
      }
      setPath(working, rule.to, cloneJson(resolved));
      if (rule.move && this._options.passthrough) {
        deletePath(working, rule.fromPath);
        moved.push(rule.declaredFrom);
      }
    }

    return { body: working, moved, missing };
  }
}

/** Convenience one-shot reshaping. */
export function reshapeBody(
  body: JsonValue,
  rules: readonly ReshapeRule[],
  options?: BodyReshaperOptions
): ReshapeResult {
  return new BodyReshaper(rules, options).reshape(body);
}
