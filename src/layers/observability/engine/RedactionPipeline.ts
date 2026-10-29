/**
 * Redaction Pipeline
 *
 * Scrubs PII and secrets from signal attributes and log bodies before
 * they leave the process. Matchers run as an ordered pipeline — each
 * matcher receives the output of the previous one, so redactions can be
 * layered (e.g. mask a credit-card number, then mask the surrounding
 * key name).
 *
 * The pipeline operates on two shapes:
 *   - `redactText(body)` for log strings
 *   - `redactAttributes(attrs)` which walks nested attribute values and
 *     applies both key-based rules ("password" => mask regardless of
 *     value) and value-pattern rules.
 *
 * Complexity: O(n * m) where n = input size, m = matcher count. Matchers
 * are anchored regexes or substring scans; the pipeline is bounded and
 * allocation-free apart from the replaced output strings.
 *
 * @module ObservabilityLayer/Engine
 */

import { Attributes, isRecord } from './signals';

/** What to replace matched content with. */
export type RedactionStyle = 'mask' | 'hash' | 'remove' | 'tokenize';

export interface RedactionResult {
  /** How many replacements this matcher performed. */
  replacements: number;
}

/** A pattern matcher operates on a single string value. */
export interface IRedactionMatcher {
  readonly name: string;
  readonly style: RedactionStyle;
  /**
   * @param value   the raw string (log body or attribute value)
   * @param keyHint optional attribute key, lets matchers be key-aware
   * @returns the redacted string, or the original reference if unchanged
   */
  apply(value: string, keyHint?: string): { text: string; changed: boolean };
}

/** Deterministic non-cryptographic hash for the 'hash' style (FNV-1a hex). */
function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'h:' + h.toString(16).padStart(8, '0');
}

function renderReplacement(style: RedactionStyle, name: string, matched: string): string {
  switch (style) {
    case 'mask':
      return `[REDACTED:${name}]`;
    case 'hash':
      return `[HASH:${name}:${stableHash(matched)}]`;
    case 'remove':
      return '';
    case 'tokenize':
      // Token is a stable, joinable surrogate — same input => same token.
      return `[TOKEN:${name}:${stableHash(matched)}]`;
  }
}

/** Regex-based matcher — the workhorse of the pipeline. */
export class RegexMatcher implements IRedactionMatcher {
  readonly name: string;
  readonly style: RedactionStyle;
  private readonly _pattern: RegExp;

  constructor(name: string, pattern: RegExp, style: RedactionStyle = 'mask') {
    this.name = name;
    this.style = style;
    // Force a global, case-insensitive-friendly flag set.
    this._pattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  }

  apply(value: string): { text: string; changed: boolean } {
    let changed = false;
    const text = value.replace(this._pattern, (m) => {
      changed = true;
      return renderReplacement(this.style, this.name, m);
    });
    return { text, changed };
  }
}

/**
 * Key-name matcher: when the attribute key matches one of the sensitive
 * names (password, secret, token, ssn, ...) the *entire* value is
 * replaced regardless of content. This catches secrets that don't match
 * any regex shape.
 */
export class SensitiveKeyMatcher implements IRedactionMatcher {
  readonly name = 'sensitive-key';
  readonly style: RedactionStyle;
  private readonly _keys: Set<string>;

  constructor(keys: ReadonlyArray<string>, style: RedactionStyle = 'mask') {
    this.style = style;
    this._keys = new Set(keys.map((k) => k.toLowerCase()));
  }

  appliesToKey(key: string): boolean {
    const k = key.toLowerCase();
    if (this._keys.has(k)) return true;
    // Substring match for keys like `db_password`, `x-api-key`.
    for (const probe of this._keys) {
      if (k.includes(probe)) return true;
    }
    return false;
  }

  apply(value: string, keyHint?: string): { text: string; changed: boolean } {
    if (keyHint === undefined || !this.appliesToKey(keyHint)) {
      return { text: value, changed: false };
    }
    return { text: renderReplacement(this.style, this.name, value), changed: true };
  }
}

/** Built-in matcher catalogue for common PII shapes. */
export const BUILTIN_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  usSsn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  jwt: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g,
  awsAccessKey: /\bAKIA[0-9A-Z]{16}\b/g,
  bearerToken: /Bearer\s+[A-Za-z0-9._~+/=-]+/g,
} as const;

/** Default sensitive key names checked by `SensitiveKeyMatcher`. */
export const DEFAULT_SENSITIVE_KEYS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'api-key',
  'token',
  'ssn',
  'authorization',
  'auth',
  'credential',
  'private_key',
];

export interface RedactionPipelineStats {
  evaluations: number;
  totalReplacements: number;
  perMatcherReplacements: Record<string, number>;
}

/**
 * Ordered redaction pipeline. `redactText` returns the scrubbed string;
 * `redactAttributes` deep-copies the attribute map, applying key rules
 * to values and value rules to every string leaf (including nested
 * arrays).
 */
export class RedactionPipeline {
  private readonly _matchers: IRedactionMatcher[];
  private _stats: RedactionPipelineStats = {
    evaluations: 0,
    totalReplacements: 0,
    perMatcherReplacements: {},
  };

  constructor(matchers: ReadonlyArray<IRedactionMatcher>) {
    this._matchers = [...matchers];
  }

  static defaults(): RedactionPipeline {
    return new RedactionPipeline([
      new SensitiveKeyMatcher(DEFAULT_SENSITIVE_KEYS),
      new RegexMatcher('bearer', BUILTIN_PATTERNS.bearerToken, 'remove'),
      new RegexMatcher('jwt', BUILTIN_PATTERNS.jwt, 'hash'),
      new RegexMatcher('aws-key', BUILTIN_PATTERNS.awsAccessKey, 'mask'),
      new RegexMatcher('credit-card', BUILTIN_PATTERNS.creditCard, 'mask'),
      new RegexMatcher('ssn', BUILTIN_PATTERNS.usSsn, 'mask'),
      new RegexMatcher('email', BUILTIN_PATTERNS.email, 'tokenize'),
    ]);
  }

  /** Scrub a single log body / string. */
  redactText(input: string, keyHint?: string): string {
    this._stats.evaluations++;
    let out = input;
    for (const m of this._matchers) {
      const r = m.apply(out, keyHint);
      if (r.changed) {
        this._stats.totalReplacements++;
        this._stats.perMatcherReplacements[m.name] =
          (this._stats.perMatcherReplacements[m.name] ?? 0) + 1;
        out = r.text;
      }
    }
    return out;
  }

  /**
   * Scrub an attribute map. Returns a NEW object — the input is never
   * mutated — so upstream code can keep the pre-redaction copy for
   * debugging inside a trust boundary.
   */
  redactAttributes(attrs: Attributes): Attributes {
    const out: Attributes = {};
    for (const [key, value] of Object.entries(attrs)) {
      out[key] = this._redactValue(value, key);
    }
    return out;
  }

  private _redactValue(value: unknown, key: string): string | number | boolean | AttributeValueArray | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      return this.redactText(value, key);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      // Sensitive keys trump types: mask numeric secrets too.
      const keyMatcher = this._matchers.find(
        (m): m is SensitiveKeyMatcher => m instanceof SensitiveKeyMatcher && m.appliesToKey(key)
      );
      if (keyMatcher) {
        return renderReplacement(keyMatcher.style, keyMatcher.name, String(value));
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) =>
        typeof v === 'string' ? this.redactText(v, key) : v
      ) as AttributeValueArray;
    }
    if (isRecord(value)) {
      // Nested maps are stringified defensively then scrubbed as text.
      return this.redactText(JSON.stringify(value), key);
    }
    return undefined;
  }

  getStats(): RedactionPipelineStats {
    return {
      ...this._stats,
      perMatcherReplacements: { ...this._stats.perMatcherReplacements },
    };
  }

  resetStats(): void {
    this._stats = { evaluations: 0, totalReplacements: 0, perMatcherReplacements: {} };
  }
}

type AttributeValueArray = Array<string | number | boolean>;
