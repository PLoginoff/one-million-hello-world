/**
 * Configuration Engine — Built-in Sources
 *
 * Concrete ConfigSource implementations for the common tiers:
 *
 *   - ObjectConfigSource: wraps a literal (defaults, test fixtures).
 *   - EnvConfigSource: maps `process.env` into dot-paths via a prefix +
 *     `__` separator convention (`APP_DB__HOST` → `db.host`) — the same
 *     convention Kubernetes/Spring use. Includes light type coercion
 *     (`"true"`/`"42"`/`"null"` → typed) since env vars are always strings.
 *   - FileConfigSource: reads a JSON file from disk via an injectable
 *     `readFile` function — injectable so tests and non-Node runtimes can
 *     supply their own loader.
 *
 * Each source also exposes `fingerprint()` — a cheap content hash of the
 * raw payload — which the hot-reload watcher uses to skip no-op reloads
 * without running the full merge.
 *
 * @module Configuration/Engine
 */

import { createHash } from 'crypto';
import { ConfigObject, ConfigPrecedence, ConfigSource, ConfigValue, isConfigObject } from './ConfigTypes';
import { flattenTree, setPath } from './ConfigMerger';

/** Stable content hash of a payload — key order doesn't matter. */
export function fingerprintEntries(entries: Readonly<Record<string, ConfigValue>>): string {
  const keys = Object.keys(entries).sort();
  const h = createHash('sha256');
  for (const k of keys) {
    h.update(k);
    h.update('=');
    h.update(stableStringify(entries[k]));
    h.update(';');
  }
  return h.digest('hex');
}

/** Deterministic stringify — object keys sorted recursively. */
export function stableStringify(v: ConfigValue): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as ConfigObject)[k])}`).join(',')}}`;
}

/** Wraps a static object or flat entries map. */
export class ObjectConfigSource implements ConfigSource {
  readonly name: string;
  readonly precedence: ConfigPrecedence;
  private readonly _entries: Record<string, ConfigValue>;
  private readonly _isFlat: boolean;

  constructor(name: string, precedence: ConfigPrecedence, entries: ConfigObject | Readonly<Record<string, ConfigValue>>, isFlat = false) {
    this.name = name;
    this.precedence = precedence;
    this._isFlat = isFlat;
    this._entries = { ...(entries as Record<string, ConfigValue>) };
  }

  load(): Record<string, ConfigValue> {
    if (this._isFlat) return { ...this._entries };
    // Nested object → flatten.
    const nested = this._entries as ConfigObject;
    const flat = flattenTree(nested);
    return flat;
  }

  fingerprint(): string {
    return fingerprintEntries(this.load());
  }
}

export interface EnvSourceOptions {
  /** Only vars starting with this prefix are included (e.g. 'APP_'). */
  readonly prefix?: string;
  /** Path separator inside var names (default '__'). */
  readonly separator?: string;
  /** Lowercase the derived path segments (default true). */
  readonly lowercase?: boolean;
  /** Explicit env map — defaults to process.env (injectable for tests). */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Coerce an env string into a typed scalar. `"true"`, `"42"`, `"3.14"`,
 * `"null"` map to primitives; anything else stays a string. Quoted strings
 * (`"'42'"`) stay strings — an escape hatch for numeric-looking strings.
 */
export function coerceEnvValue(raw: string): ConfigValue {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  const l = t.toLowerCase();
  if (l === 'true') return true;
  if (l === 'false') return false;
  if (l === 'null') return null;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed === null || typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
        return parsed;
      }
      if (Array.isArray(parsed)) return parsed as ConfigValue;
      if (typeof parsed === 'object') return parsed as ConfigValue;
    } catch {
      // Not JSON — fall through to string.
    }
  }
  return raw;
}

export class EnvConfigSource implements ConfigSource {
  readonly name = 'env';
  readonly precedence = ConfigPrecedence.ENV;
  private readonly _opts: Required<Omit<EnvSourceOptions, 'prefix' | 'env'>> & Pick<EnvSourceOptions, 'prefix' | 'env'>;

  constructor(options: EnvSourceOptions = {}) {
    this._opts = {
      prefix: options.prefix,
      separator: options.separator ?? '__',
      lowercase: options.lowercase ?? true,
      env: options.env,
    };
  }

  load(): Record<string, ConfigValue> {
    const env = this._opts.env ?? (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});
    const out: Record<string, ConfigValue> = {};
    for (const key of Object.keys(env)) {
      const val = env[key];
      if (val === undefined) continue;
      if (this._opts.prefix !== undefined && !key.startsWith(this._opts.prefix)) continue;
      const stripped = this._opts.prefix !== undefined ? key.slice(this._opts.prefix.length) : key;
      if (stripped === '') continue;
      const path = stripped
        .split(this._opts.separator)
        .filter((s) => s.length > 0)
        .map((s) => (this._opts.lowercase ? s.toLowerCase() : s))
        .join('.');
      if (path === '') continue;
      // Store into a nested-safe flat map: segments may themselves contain
      // dots? No — separator splits them. Use setPath onto a tree then flatten
      // so `A__B__C` and `A__B.D` coexist predictably: direct flat assignment.
      out[path] = coerceEnvValue(val);
    }
    return out;
  }

  fingerprint(): string {
    return fingerprintEntries(this.load());
  }
}

export interface FileSourceOptions {
  readonly path: string;
  readonly name?: string;
  readonly precedence?: ConfigPrecedence;
  /**
   * Injectable reader — return the file's text content, or undefined when
   * missing (missing files produce an empty layer, not an error).
   */
  readonly readFile?: (path: string) => Promise<string | undefined> | string | undefined;
  /** Parse override — defaults to JSON.parse. */
  readonly parse?: (text: string) => ConfigObject;
}

export class FileConfigSource implements ConfigSource {
  readonly name: string;
  readonly precedence: ConfigPrecedence;
  private readonly _path: string;
  private readonly _readFile: (path: string) => Promise<string | undefined> | string | undefined;
  private readonly _parse: (text: string) => ConfigObject;

  constructor(options: FileSourceOptions) {
    this._path = options.path;
    this.name = options.name ?? `file:${options.path}`;
    this.precedence = options.precedence ?? ConfigPrecedence.FILE;
    this._readFile = options.readFile ?? ((p) => this._nodeRead(p));
    this._parse = options.parse ?? ((t) => JSON.parse(t) as ConfigObject);
  }

  async load(): Promise<Record<string, ConfigValue>> {
    const text = await this._readFile(this._path);
    if (text === undefined) return {};
    const obj = this._parse(text);
    if (!isConfigObject(obj)) return {};
    return flattenTree(obj);
  }

  private _nodeRead(p: string): Promise<string | undefined> {
    // Lazy require so importing this module doesn't pull 'fs' in tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as { existsSync(x: string): boolean; promises: { readFile(x: string, enc: string): Promise<string> } };
    if (!fs.existsSync(p)) return Promise.resolve(undefined);
    return fs.promises.readFile(p, 'utf8');
  }
}
