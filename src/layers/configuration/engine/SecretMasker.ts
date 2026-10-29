/**
 * Configuration Engine — Secret Masker
 *
 * Tracks which config paths contain secrets and rewrites serialized output
 * so secrets never leak into logs, health endpoints or snapshot dumps.
 *
 * Paths are declared with the same wildcard grammar as schema rules:
 *   - exact:      `database.primary.password`
 *   - one-level:  `services.*.apiKey`
 *   - deep:       `**.token`, `vault.**`
 *
 * Masking preserves *some* debugging information by default: the masked
 * string keeps a length hint and (optionally) a short prefix, so "empty vs
 * populated" and "did it rotate" are visible without revealing the value.
 *
 * @module Configuration/Engine
 */

import { ConfigObject, ConfigValue, isConfigObject } from './ConfigTypes';
import { getPath, setPath, splitPath } from './ConfigMerger';

export interface SecretMaskOptions {
  /** Replacement text. Default `'***'` plus length hint. */
  readonly mask?: string;
  /** Visible leading characters of the secret (0 = none). Default 0. */
  readonly prefixLength?: number;
  /** Append `(<n> chars)` hint. Default true. */
  readonly includeLengthHint?: boolean;
}

const DEFAULT_OPTIONS: Required<SecretMaskOptions> = {
  mask: '***',
  prefixLength: 0,
  includeLengthHint: true,
};

/**
 * Convert a dot-path with wildcards into a RegExp.
 *   `a.*.c`  → /^a\.[^.]+\.c$/
 *   `a.**`   → /^a(\..+)?$/          (matches the segment itself + children)
 *   `**.key` → /^(.+\.)?key$/
 */
export function pathPatternToRegex(pattern: string): RegExp {
  const segs = splitPath(pattern);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let body = '';
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const isLast = i === segs.length - 1;
    if (seg === '**') {
      // '**' = zero or more segments. Non-last position absorbs its own
      // trailing separator ('a.**.b' → 'a\.(?:[^.]+\.)*b', matches 'a.b');
      // last position appends optional children ('vault.**' also matches
      // bare 'vault'). A lone '**' matches any non-empty path.
      body += isLast ? (body === '' ? '[^.]+(?:\\.[^.]+)*' : '(?:\\.[^.]+)*') : '(?:[^.]+\\.)*';
      continue;
    }
    const piece = seg === '*' ? '[^.]+' : escape(seg);
    // A preceding non-last '**' already supplied the separator.
    const needSep = i > 0 && segs[i - 1] !== '**';
    body += (needSep ? '\\.' : '') + piece;
  }
  return new RegExp(`^${body}$`);
}

export class SecretMasker {
  private readonly _patterns: RegExp[] = [];
  private readonly _patternStrings: string[] = [];
  private readonly _options: Required<SecretMaskOptions>;

  constructor(patterns: ReadonlyArray<string> = [], options: SecretMaskOptions = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    for (const p of patterns) this.addPattern(p);
  }

  get patternCount(): number {
    return this._patterns.length;
  }

  /** Register a secret path pattern. Duplicate registrations are ignored. */
  addPattern(pattern: string): void {
    if (this._patternStrings.includes(pattern)) return;
    this._patternStrings.push(pattern);
    this._patterns.push(pathPatternToRegex(pattern));
  }

  /** True when `path` matches any registered secret pattern. */
  isSecret(path: string): boolean {
    return this._patterns.some((r) => r.test(path));
  }

  /** Produce the masked representation of a value. */
  mask(value: ConfigValue): ConfigValue {
    if (typeof value === 'string') {
      const prefix = this._options.prefixLength > 0 ? value.slice(0, this._options.prefixLength) : '';
      const hint = this._options.includeLengthHint ? `(${value.length} chars)` : '';
      return `${prefix}${this._options.mask}${hint}`;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return this._options.mask;
    }
    // Arrays/objects under a secret path get replaced wholesale.
    return this._options.mask;
  }

  /** Mask a single path inside `tree` in place. */
  maskPath(tree: ConfigObject, path: string): void {
    const v = getPath(tree, path);
    if (v !== undefined) {
      setPath(tree, path, this.mask(v));
    }
  }

  /**
   * Walk a (cloned) tree and mask every leaf whose full path is secret.
   * Iterative DFS — no recursion depth concerns on deep configs.
   */
  maskTree(tree: ConfigObject): void {
    const stack: Array<{ node: ConfigObject; path: string }> = [{ node: tree, path: '' }];
    while (stack.length > 0) {
      const { node, path } = stack.pop() as { node: ConfigObject; path: string };
      for (const key of Object.keys(node)) {
        const p = path === '' ? key : `${path}.${key}`;
        const v = node[key];
        if (isConfigObject(v)) {
          if (this.isSecret(p)) {
            node[key] = this.mask(v);
          } else {
            stack.push({ node: v, path: p });
          }
        } else if (this.isSecret(p)) {
          node[key] = this.mask(v);
        }
      }
    }
  }

  /** Registered pattern strings (for diagnostics / listing). */
  patterns(): ReadonlyArray<string> {
    return this._patternStrings;
  }
}
