/**
 * Configuration Engine2 — Feature Namespaces
 *
 * A flat EffectiveConfig serves the whole process; a feature shouldn't
 * see (or accidentally write) keys outside its own prefix. Namespaces
 * give each feature a scoped, prefix-stripped view:
 *
 *   ns('billing').get('timeout')  →  effective.get('billing.timeout')
 *
 * Semantics:
 *   - Reads are LIVE views over the underlying config — a hot reload is
 *     visible through the namespace without re-binding.
 *   - `sub('stripe')` composes: billing → billing.stripe.
 *   - `declared(schema)` attaches a JsonSchemaLike to the namespace root;
 *     `validate()` then checks just this subtree — per-feature config
 *     contracts instead of one global schema.
 *   - `ownKeys()` lists immediate child keys under the prefix for
 *     admin UIs ("which billing.* keys exist?").
 *
 * Complexity: get O(path length); ownKeys O(paths under prefix) via the
 * flattened map — config path counts are small (hundreds).
 *
 * @module Configuration/Engine2
 */

import { ConfigValue, EffectiveConfig } from '../engine/ConfigTypes';
import { JsonSchemaLike, JsonSchemaValidator, ValidationResult } from './JsonSchemaValidator';

export class ConfigNamespace {
  private readonly _config: EffectiveConfig;
  /** Prefix without trailing dot ('billing' or 'billing.stripe'). */
  readonly prefix: string;
  private _schema: JsonSchemaLike | null = null;

  constructor(config: EffectiveConfig, prefix: string) {
    if (prefix === '' || prefix.includes('..')) {
      throw new Error(`invalid namespace prefix '${prefix}'`);
    }
    this._config = config;
    this.prefix = prefix;
  }

  /** Fully-qualified path for a local key. */
  private _fq(key: string): string {
    return key === '' ? this.prefix : `${this.prefix}.${key}`;
  }

  get(key: string): ConfigValue | undefined {
    return this._config.get(this._fq(key));
  }

  getString(key: string, fallback?: string): string {
    return this._config.getString(this._fq(key), fallback);
  }

  getNumber(key: string, fallback?: number): number {
    return this._config.getNumber(this._fq(key), fallback);
  }

  getBoolean(key: string, fallback?: boolean): boolean {
    return this._config.getBoolean(this._fq(key), fallback);
  }

  /** Nested namespace view — billing.sub('stripe') → billing.stripe. */
  sub(child: string): ConfigNamespace {
    const ns = new ConfigNamespace(this._config, this._fq(child));
    if (this._schema) {
      // Propagate the parent's sub-schema when one is declared for child.
      const childSchema = this._schema.properties?.[child];
      if (childSchema) ns.declare(childSchema);
    }
    return ns;
  }

  /** Immediate child keys under the prefix (one segment deep). */
  ownKeys(): readonly string[] {
    const prefixDot = `${this.prefix}.`;
    const keys = new Set<string>();
    for (const p of this._config.paths()) {
      if (!p.startsWith(prefixDot)) continue;
      const rest = p.slice(prefixDot.length);
      keys.add(rest.split('.')[0]);
    }
    return [...keys].sort();
  }

  /** This namespace's subtree as a plain object (prefix stripped). */
  toObject(): Record<string, ConfigValue> {
    const prefixDot = `${this.prefix}.`;
    const flat: Record<string, ConfigValue> = {};
    for (const p of this._config.paths()) {
      if (p.startsWith(prefixDot)) flat[p.slice(prefixDot.length)] = this._config.get(p)!;
    }
    return unflatten(flat);
  }

  /** Attach a schema contract for this subtree. */
  declare(schema: JsonSchemaLike): this {
    this._schema = schema;
    return this;
  }

  /** Validate the namespace subtree against its declared schema. */
  validate(): ValidationResult {
    if (!this._schema) return { valid: true, violations: [] };
    return new JsonSchemaValidator().validate(
      this.toObject() as ConfigValue,
      this._schema,
      this.prefix
    );
  }
}

/** dot-path map → nested object (inverse of EffectiveConfig.flatten). */
function unflatten(flat: Record<string, ConfigValue>): Record<string, ConfigValue> {
  const root: Record<string, ConfigValue> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let cur: Record<string, ConfigValue> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const next = cur[seg];
      if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
        cur = next as Record<string, ConfigValue>;
      } else {
        const obj: Record<string, ConfigValue> = {};
        cur[seg] = obj;
        cur = obj;
      }
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}
