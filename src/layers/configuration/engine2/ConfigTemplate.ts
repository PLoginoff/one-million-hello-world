/**
 * Configuration Engine2 — Environment Templates
 *
 * Every service ends up defining near-identical config trees per
 * environment (dev/staging/prod) with a handful of differing values.
 * Templates parameterize the shared skeleton:
 *
 *   - `define(name, tree)` — a tree with `${var}` and `${var|default}`
 *     placeholders in string leaves.
 *   - `instantiate(name, vars)` — substitute placeholders; unsubstituted
 *     variables without defaults keep the literal placeholder so a missing
 *     var is visible, not silently empty.
 *   - `generate(envs)` — produce a config tree PER environment by merging
 *     shared vars with per-env vars (env wins) — the "stamp out dev/
 *     staging/prod" operation.
 *   - Composition: `${include:other-template}` placeholders splice another
 *     template's subtree, with cycle detection.
 *
 * Substitution happens on the FINAL tree structure (post-include), so
 * variables can flow through included fragments.
 *
 * Complexity: O(tree nodes) per instantiate; includes O(template count).
 *
 * @module Configuration/Engine2
 */

import { ConfigObject, ConfigValue, isConfigObject } from '../engine/ConfigTypes';

const VAR_RE = /\$\{(\w+)(?:\|([^}]*))?\}/g;
const INCLUDE_RE = /^\$\{include:([\w.-]+)\}$/;

export interface EnvSpec {
  readonly name: string;
  readonly vars: Readonly<Record<string, string>>;
}

export class ConfigTemplates {
  private readonly _templates = new Map<string, ConfigObject>();

  define(name: string, tree: ConfigObject): void {
    this._templates.set(name, tree);
  }

  template(name: string): ConfigObject | undefined {
    return this._templates.get(name);
  }

  /** Substitute `${var}` / `${var|default}` across a tree. */
  instantiate(name: string, vars: Readonly<Record<string, string>>): ConfigObject {
    const raw = this._templates.get(name);
    if (!raw) throw new Error(`unknown config template '${name}'`);
    const expanded = this._expandIncludes(raw, new Set([name]));
    return substitute(expanded, vars) as ConfigObject;
  }

  /**
   * One tree per environment: shared vars merged under per-env vars.
   * Result is a map env name → instantiated config.
   */
  generate(
    name: string,
    sharedVars: Readonly<Record<string, string>>,
    envs: readonly EnvSpec[]
  ): Map<string, ConfigObject> {
    const out = new Map<string, ConfigObject>();
    for (const e of envs) {
      out.set(e.name, this.instantiate(name, { ...sharedVars, ...e.vars }));
    }
    return out;
  }

  /**
   * Recursively expand `${include:name}` leaves — a leaf whose WHOLE
   * string is an include splices that template's tree in place.
   */
  private _expandIncludes(tree: ConfigValue, visiting: Set<string>): ConfigValue {
    if (typeof tree === 'string') {
      const m = INCLUDE_RE.exec(tree);
      if (!m) return tree;
      const target = m[1];
      if (visiting.has(target)) {
        throw new Error(`circular config template include: '${target}'`);
      }
      const raw = this._templates.get(target);
      if (!raw) throw new Error(`unknown included template '${target}'`);
      visiting.add(target);
      const expanded = this._expandIncludes(raw, visiting);
      visiting.delete(target);
      return expanded;
    }
    if (Array.isArray(tree)) {
      return tree.map((v) => this._expandIncludes(v, visiting));
    }
    if (isConfigObject(tree)) {
      const out: ConfigObject = {};
      for (const [k, v] of Object.entries(tree)) {
        out[k] = this._expandIncludes(v, visiting);
      }
      return out;
    }
    return tree;
  }

  /** Placeholder variables referenced by a template (post-include). */
  variables(name: string): readonly string[] {
    const raw = this._templates.get(name);
    if (!raw) throw new Error(`unknown config template '${name}'`);
    const expanded = this._expandIncludes(raw, new Set([name])) as ConfigObject;
    const vars = new Set<string>();
    const walk = (v: ConfigValue): void => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(VAR_RE)) {
          if (INCLUDE_RE.test(m[0])) continue;
          vars.add(m[1]);
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (isConfigObject(v)) Object.values(v).forEach(walk);
    };
    walk(expanded);
    return [...vars].sort();
  }
}

function substitute(tree: ConfigValue, vars: Readonly<Record<string, string>>): ConfigValue {
  if (typeof tree === 'string') {
    return tree.replace(VAR_RE, (full, name: string, def: string | undefined) => {
      if (name === 'include') return full; // expanded already
      return vars[name] ?? def ?? full;
    });
  }
  if (Array.isArray(tree)) return tree.map((v) => substitute(v, vars));
  if (isConfigObject(tree)) {
    const out: ConfigObject = {};
    for (const [k, v] of Object.entries(tree)) out[k] = substitute(v, vars);
    return out;
  }
  return tree;
}
