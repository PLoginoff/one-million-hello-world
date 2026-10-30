/**
 * Secrets Engine2 — Secret Templates (standard shapes)
 *
 * Services keep inventing secret layouts: some store `user:pass`, some a
 * JSON blob, some seven separate keys. Templates enforce house-standard
 * SHAPES so every db-connection looks like every other db-connection:
 *
 *   - `define(name, fields)` — a field list with types and optionality;
 *     templates are versioned (define bumps the version, keeping older
 *     ones registered for decoding existing secrets).
 *   - `encode(name, values)` / `decode(name, payload)` — canonical wire
 *     form: version-prefixed JSON (`{ _tpl: "name@1", f: {...} }`) so a
 *     stored secret self-describes its shape.
 *   - `validate(name, values)` — field-type checks before writing, so a
 *     malformed db-connection never reaches the vault.
 *   - `parse(payload)` — sniff the template name+version off a stored
 *     payload and decode against that exact version — old secrets stay
 *     readable after the template evolves.
 *
 * Built-ins: db-connection, api-key, tls-cert, oauth-client — the four
 * shapes covering ~90% of operational secrets.
 *
 * Complexity: O(fields) per encode/validate.
 *
 * @module Secrets/Engine2
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'url' | 'host:port';

export interface TemplateField {
  readonly name: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Allowed values (optional). */
  readonly enum?: readonly string[];
}

export interface SecretTemplate {
  readonly name: string;
  readonly version: number;
  readonly fields: readonly TemplateField[];
}

export interface ValidationIssue {
  readonly field: string;
  readonly issue: 'missing' | 'type' | 'enum';
  readonly message: string;
}

interface TemplateDef {
  name: string;
  fields: readonly TemplateField[];
}

const BUILT_INS: Readonly<Record<string, readonly TemplateField[]>> = {
  'db-connection': [
    { name: 'host', type: 'string', required: true },
    { name: 'port', type: 'number', required: true },
    { name: 'database', type: 'string', required: true },
    { name: 'username', type: 'string', required: true },
    { name: 'password', type: 'string', required: true },
    { name: 'ssl', type: 'boolean', required: false },
  ],
  'api-key': [
    { name: 'key', type: 'string', required: true },
    { name: 'keyId', type: 'string', required: false },
    { name: 'scopes', type: 'string', required: false },
  ],
  'tls-cert': [
    { name: 'cert', type: 'string', required: true },
    { name: 'key', type: 'string', required: true },
    { name: 'chain', type: 'string', required: false },
    { name: 'expiresAt', type: 'number', required: false },
  ],
  'oauth-client': [
    { name: 'clientId', type: 'string', required: true },
    { name: 'clientSecret', type: 'string', required: true },
    { name: 'issuer', type: 'url', required: true },
    { name: 'audience', type: 'string', required: false },
  ],
};

export class SecretTemplates {
  /** name → version → template. */
  private readonly _templates = new Map<string, Map<number, SecretTemplate>>();

  constructor(includeBuiltIns = true) {
    if (includeBuiltIns) {
      for (const [name, fields] of Object.entries(BUILT_INS)) {
        this.define(name, fields);
      }
    }
  }

  /** Register (or version-bump) a template. Returns the new version. */
  define(name: string, fields: readonly TemplateField[]): number {
    let versions = this._templates.get(name);
    if (!versions) {
      versions = new Map();
      this._templates.set(name, versions);
    }
    const version = versions.size + 1;
    versions.set(version, { name, version, fields });
    return version;
  }

  template(name: string, version?: number): SecretTemplate | undefined {
    const versions = this._templates.get(name);
    if (!versions) return undefined;
    const v = version ?? Math.max(...versions.keys());
    return versions.get(v);
  }

  validate(name: string, values: Readonly<Record<string, unknown>>, version?: number): ValidationIssue[] {
    const t = this.template(name, version);
    if (!t) return [{ field: '', issue: 'missing', message: `unknown template '${name}'` }];
    const issues: ValidationIssue[] = [];
    for (const f of t.fields) {
      const v = values[f.name];
      if (v === undefined || v === null) {
        if (f.required) issues.push({ field: f.name, issue: 'missing', message: 'required field absent' });
        continue;
      }
      if (!typeOk(v, f.type)) {
        issues.push({ field: f.name, issue: 'type', message: `expected ${f.type}, got ${typeof v}` });
        continue;
      }
      if (f.enum && typeof v === 'string' && !f.enum.includes(v)) {
        issues.push({ field: f.name, issue: 'enum', message: `must be one of ${f.enum.join(', ')}` });
      }
    }
    return issues;
  }

  /**
   * Canonical wire form: `{ _tpl: "name@version", f: {…} }`. Throws on
   * validation failure — refuse to encode a malformed secret.
   */
  encode(name: string, values: Readonly<Record<string, unknown>>): string {
    const issues = this.validate(name, values);
    if (issues.length > 0) {
      throw new Error(
        `template '${name}' validation failed: ${issues.map((i) => `${i.field}:${i.issue}`).join(', ')}`
      );
    }
    const t = this.template(name)!;
    return JSON.stringify({ _tpl: `${name}@${t.version}`, f: values });
  }

  /** Decode a payload produced by `encode` — uses the version stamped in. */
  decode(payload: string): { template: string; version: number; fields: Record<string, unknown> } {
    const parsed = JSON.parse(payload) as { _tpl?: string; f?: Record<string, unknown> };
    const tag = parsed._tpl;
    if (typeof tag !== 'string' || !tag.includes('@')) {
      throw new Error('payload is not a templated secret');
    }
    const [name, ver] = tag.split('@');
    const version = Number(ver);
    const t = this.template(name, version);
    if (!t) throw new Error(`no template '${name}@${version}' registered`);
    // Validate the decoded fields against their declared version —
    // schema drift between versions is surfaced here, not downstream.
    const issues: ValidationIssue[] = [];
    for (const f of t.fields) {
      const v = parsed.f?.[f.name];
      if (v === undefined) {
        if (f.required) issues.push({ field: f.name, issue: 'missing', message: 'required absent' });
        continue;
      }
      if (!typeOk(v, f.type)) issues.push({ field: f.name, issue: 'type', message: 'type mismatch' });
    }
    if (issues.length > 0) {
      throw new Error(`decoded payload violates '${name}@${version}': ${issues.map((i) => i.field).join(', ')}`);
    }
    return { template: name, version, fields: parsed.f ?? {} };
  }

  /** True when the payload looks templated (carries a _tpl tag). */
  isTemplated(payload: string): boolean {
    try {
      const p = JSON.parse(payload) as { _tpl?: unknown };
      return typeof p._tpl === 'string';
    } catch {
      return false;
    }
  }

  versions(name: string): readonly number[] {
    return [...(this._templates.get(name)?.keys() ?? [])].sort((a, b) => a - b);
  }
}

function typeOk(v: unknown, t: FieldType): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'url':
      return typeof v === 'string' && /^https?:\/\//.test(v);
    case 'host:port':
      return typeof v === 'string' && /^[\w.-]+:\d+$/.test(v);
  }
}
