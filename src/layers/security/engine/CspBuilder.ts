/**
 * CspBuilder — fluent Content-Security-Policy directive composer with
 * per-directive validation.
 *
 * `SecurityHeaders` in this engine *parses and verifies* a CSP that
 * already exists; this module is the other direction — building one
 * correctly in the first place. The value of a builder over string
 * concatenation is *validation at construction time*: a misspelled
 * directive name, a nonce on the wrong directive, `'unsafe-inline'`
 * coexisting with a nonce (which per spec makes the keyword ignored
 * and is almost always a bug) are all caught here, not in production.
 *
 * Grammar implemented (CSP Level 3, the fetch/directive subset that
 * shows up in real headers):
 *
 *   source-list    = ('none' | 'self' | 'unsafe-inline' | 'unsafe-eval'
 *                    | 'strict-dynamic' | 'unsafe-hashes'
 *                    | host-source | scheme-source | nonce | hash)+
 *   host-source    = scheme://host[:port][/path] | host | *.host
 *   nonce-source   = 'nonce-<base64>'
 *   hash-source    = 'sha256-<b64>' | 'sha384-' | 'sha512-'
 *   sandbox        = token list (allow-scripts, allow-forms, ...)
 *   uri directives = report-uri, base-uri, form-action, frame-ancestors
 *   flags          = upgrade-insecure-requests, block-all-mixed-content
 *   misc           = require-trusted-types-for, trusted-types
 *
 * Validation severity: `error` = would break parsing or invert intent
 * (refuses to build); `warning` = legal but suspicious (builds anyway,
 * reported in `validate()`).
 *
 * @module SecurityLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Directive registry                                                  */
/* ------------------------------------------------------------------ */

/** How a directive's value is interpreted by the validator. */
const enum DirectiveKind {
  /** Fetch directives take a source list. */
  SOURCE_LIST = 'source-list',
  /** Takes a space-separated URI list (or 'none'). */
  URI_LIST = 'uri-list',
  /** sandbox token vocabulary. */
  SANDBOX = 'sandbox',
  /** No value — presence is the directive. */
  FLAG = 'flag',
  /** 'report' (e.g. require-trusted-types-for 'script'). */
  KEYWORD_ARG = 'keyword-arg',
  /** trusted-types policy-name list. */
  TRUSTED_TYPES = 'trusted-types',
}

const DIRECTIVE_KINDS: Readonly<Record<string, DirectiveKind>> = {
  'default-src': DirectiveKind.SOURCE_LIST,
  'script-src': DirectiveKind.SOURCE_LIST,
  'script-src-elem': DirectiveKind.SOURCE_LIST,
  'script-src-attr': DirectiveKind.SOURCE_LIST,
  'style-src': DirectiveKind.SOURCE_LIST,
  'style-src-elem': DirectiveKind.SOURCE_LIST,
  'style-src-attr': DirectiveKind.SOURCE_LIST,
  'img-src': DirectiveKind.SOURCE_LIST,
  'font-src': DirectiveKind.SOURCE_LIST,
  'connect-src': DirectiveKind.SOURCE_LIST,
  'media-src': DirectiveKind.SOURCE_LIST,
  'object-src': DirectiveKind.SOURCE_LIST,
  'frame-src': DirectiveKind.SOURCE_LIST,
  'worker-src': DirectiveKind.SOURCE_LIST,
  'child-src': DirectiveKind.SOURCE_LIST,
  'manifest-src': DirectiveKind.SOURCE_LIST,
  'prefetch-src': DirectiveKind.SOURCE_LIST,
  'frame-ancestors': DirectiveKind.SOURCE_LIST, // hosts + 'self'/'none' only
  'form-action': DirectiveKind.URI_LIST,
  'base-uri': DirectiveKind.SOURCE_LIST,
  'report-uri': DirectiveKind.URI_LIST,
  'report-to': DirectiveKind.URI_LIST,
  sandbox: DirectiveKind.SANDBOX,
  'upgrade-insecure-requests': DirectiveKind.FLAG,
  'block-all-mixed-content': DirectiveKind.FLAG,
  'require-trusted-types-for': DirectiveKind.KEYWORD_ARG,
  'trusted-types': DirectiveKind.TRUSTED_TYPES,
};

const SANDBOX_TOKENS = new Set([
  'allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock',
  'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox',
  'allow-presentation', 'allow-same-origin', 'allow-scripts',
  'allow-storage-access-by-user-activation', 'allow-top-navigation',
  'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols',
]);

const SOURCE_KEYWORDS = new Set([
  "'none'", "'self'", "'unsafe-inline'", "'unsafe-eval'",
  "'unsafe-hashes'", "'strict-dynamic'", "'report-sample'",
  "'unsafe-allow-redirects'", "'wasm-unsafe-eval'", "'inline-speculation-rules'",
]);

export interface CspIssue {
  readonly severity: 'error' | 'warning';
  readonly directive: string;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export class CspBuilder {
  /** directive → ordered value tokens (dedup'd, 'none' exclusive). */
  private readonly _directives = new Map<string, string[]>();
  private _reportOnly = false;

  /** Emit as `Content-Security-Policy-Report-Only` instead. */
  reportOnly(v = true): this {
    this._reportOnly = v;
    return this;
  }

  /**
   * Add a directive value. `directive('script-src', "'self'", 'cdn.example.com')`.
   * Re-adding the same token dedups; adding `'none'` clears prior
   * tokens (it's exclusive by spec); adding a token to a `'none'`
   * list clears `'none'` (last write wins — but `validate()` flags
   * the mixed list if you manage it anyway via raw inspection).
   */
  directive(name: string, ...values: string[]): this {
    const key = name.toLowerCase().trim();
    let list = this._directives.get(key);
    if (!list) {
      list = [];
      this._directives.set(key, list);
    }
    for (const v of values) {
      const t = v.trim();
      if (t.length === 0) continue;
      if (t === "'none'") {
        // 'none' is exclusive — clear everything else.
        list.length = 0;
        list.push(t);
        continue;
      }
      const noneIdx = list.indexOf("'none'");
      if (noneIdx >= 0) list.splice(noneIdx, 1);
      if (!list.includes(t)) list.push(t);
    }
    return this;
  }

  /** Convenience for flag directives (upgrade-insecure-requests). */
  flag(name: string): this {
    this._directives.set(name.toLowerCase().trim(), []);
    return this;
  }

  /** Remove a directive entirely. */
  remove(name: string): this {
    this._directives.delete(name.toLowerCase().trim());
    return this;
  }

  /** `directive('script-src', "'nonce-'+value")` with correct quoting. */
  nonce(directive: string, value: string): this {
    return this.directive(directive, `'nonce-${value}'`);
  }

  /** `directive('script-src', "'sha256-'+base64")`. */
  hash(directive: string, alg: 'sha256' | 'sha384' | 'sha512', base64: string): this {
    return this.directive(directive, `'${alg}-${base64}'`);
  }

  /* ------------------------------------------------------------ */
  /* Validation                                                    */
  /* ------------------------------------------------------------ */

  /** Validate all directives; returns issues (does not mutate). */
  validate(): CspIssue[] {
    const issues: CspIssue[] = [];
    for (const [name, values] of this._directives) {
      const kind = DIRECTIVE_KINDS[name];
      if (kind === undefined) {
        issues.push({ severity: 'error', directive: name, detail: `unknown directive "${name}"` });
        continue;
      }
      switch (kind) {
        case DirectiveKind.SOURCE_LIST:
          this._validateSourceList(name, values, issues);
          break;
        case DirectiveKind.URI_LIST:
          this._validateUriList(name, values, issues);
          break;
        case DirectiveKind.SANDBOX:
          for (const v of values) {
            if (!SANDBOX_TOKENS.has(v)) {
              issues.push({ severity: 'error', directive: name, detail: `unknown sandbox token "${v}"` });
            }
          }
          break;
        case DirectiveKind.FLAG:
          if (values.length > 0) {
            issues.push({ severity: 'error', directive: name, detail: 'flag directive takes no value' });
          }
          break;
        case DirectiveKind.KEYWORD_ARG:
          for (const v of values) {
            if (!/^'[a-z-]+'$/.test(v)) {
              issues.push({ severity: 'warning', directive: name, detail: `expected a quoted keyword, got "${v}"` });
            }
          }
          break;
        case DirectiveKind.TRUSTED_TYPES:
          for (const v of values) {
            if (v !== "'none'" && v !== "'allow-duplicates'" && !/^[a-zA-Z][\w#-]*$/.test(v)) {
              issues.push({ severity: 'warning', directive: name, detail: `suspicious policy name "${v}"` });
            }
          }
          break;
      }
    }
    this._crossDirectiveIssues(issues);
    return issues;
  }

  /**
   * Serialize. Throws on any `error`-severity issue — a CSP with
   * structural problems is worse than no CSP because browsers
   * *partially* apply malformed policies.
   */
  build(): string {
    const errors = this.validate().filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new Error(
        `CSP has ${errors.length} error(s): ${errors.map((e) => `${e.directive}: ${e.detail}`).join('; ')}`
      );
    }
    const parts: string[] = [];
    for (const [name, values] of this._directives) {
      parts.push(values.length === 0 ? name : `${name} ${values.join(' ')}`);
    }
    return parts.join('; ');
  }

  /** Header name to emit under. */
  headerName(): string {
    return this._reportOnly
      ? 'content-security-policy-report-only'
      : 'content-security-policy';
  }

  /** `{headerName: value}` pair, ready for a headers object. */
  toHeader(): Record<string, string> {
    return { [this.headerName()]: this.build() };
  }

  /* ------------------------------------------------------------ */
  /* Internals                                                     */
  /* ------------------------------------------------------------ */

  private _validateSourceList(name: string, values: string[], issues: CspIssue[]): void {
    if (values.length === 0) {
      issues.push({ severity: 'error', directive: name, detail: 'source list is empty' });
      return;
    }
    const hasNonceOrHash = values.some(
      (v) => v.startsWith("'nonce-") || /^'(sha256|sha384|sha512)-/.test(v)
    );
    const hasStrictDynamic = values.includes("'strict-dynamic'");

    for (const v of values) {
      if (SOURCE_KEYWORDS.has(v)) {
        // frame-ancestors doesn't allow script-ish keywords.
        if (name === 'frame-ancestors' && v !== "'none'" && v !== "'self'") {
          issues.push({ severity: 'error', directive: name, detail: `frame-ancestors forbids ${v}` });
        }
        continue;
      }
      if (v.startsWith("'nonce-")) {
        if (name !== 'script-src' && name !== 'style-src' && !name.endsWith('-elem') && !name.endsWith('-attr') && name !== 'default-src') {
          issues.push({ severity: 'warning', directive: name, detail: 'nonce has no effect outside script/style directives' });
        }
        if (v.length < 12) {
          issues.push({ severity: 'warning', directive: name, detail: 'nonce looks too short' });
        }
        continue;
      }
      if (/^'(sha256|sha384|sha512)-[A-Za-z0-9+/=_-]+'$/.test(v)) {
        if (name !== 'script-src' && name !== 'style-src' && name !== 'default-src') {
          issues.push({ severity: 'warning', directive: name, detail: 'hash source has no effect outside script/style' });
        }
        continue;
      }
      if (v === '*' || /^\*\.[\w.-]+$/.test(v) || /^[\w.-]+(:\d+)?(\/\S*)?$/.test(v) || /^[a-z][a-z0-9+.-]*:(\/\/)?[\w.-]*/i.test(v)) {
        // host-source / scheme-source — shape is plausible.
        continue;
      }
      issues.push({ severity: 'warning', directive: name, detail: `unrecognized source "${v}"` });
    }

    // Spec footguns worth warning about.
    if (hasNonceOrHash && values.includes("'unsafe-inline'")) {
      issues.push({
        severity: 'warning',
        directive: name,
        detail: "'unsafe-inline' is ignored when a nonce or hash is present — almost certainly a mistake",
      });
    }
    if (hasStrictDynamic && (values.includes("'self'") || values.some((v) => !v.startsWith("'")))) {
      issues.push({
        severity: 'warning',
        directive: name,
        detail: "host/'self' sources are ignored when 'strict-dynamic' is present",
      });
    }
  }

  private _validateUriList(name: string, values: string[], issues: CspIssue[]): void {
    if (values.length === 0) {
      issues.push({ severity: 'error', directive: name, detail: 'uri list is empty' });
      return;
    }
    for (const v of values) {
      const ok = v === "'none'" || v === "'self'" || /^[a-z][a-z0-9+.-]*:|^\/|^[\w.-]+(:\d+)?(\/|$)/i.test(v);
      if (!ok) {
        issues.push({ severity: 'warning', directive: name, detail: `suspicious URI "${v}"` });
      }
    }
  }

  /** Rules spanning multiple directives. */
  private _crossDirectiveIssues(issues: CspIssue[]): void {
    const d = this._directives;
    if (!d.has('default-src')) {
      issues.push({
        severity: 'warning',
        directive: 'default-src',
        detail: 'no default-src — uncovered fetch directives fall back to allow-all',
      });
    }
    const objectSrc = d.get('object-src');
    const defaultSrc = d.get('default-src');
    if (objectSrc === undefined && defaultSrc === undefined) {
      issues.push({
        severity: 'warning',
        directive: 'object-src',
        detail: "object-src unset with no default-src — <object>/<embed> unrestricted; set object-src 'none'",
      });
    }
    if (d.has('upgrade-insecure-requests') && d.has('block-all-mixed-content')) {
      // Legal, but block-all-mixed-content is deprecated in favor of
      // upgrade — flagging helps audits.
      issues.push({
        severity: 'warning',
        directive: 'block-all-mixed-content',
        detail: 'deprecated alongside upgrade-insecure-requests (redundant)',
      });
    }
  }
}

/** Sensible strict baseline: `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. */
export function strictCspBaseline(): CspBuilder {
  return new CspBuilder()
    .directive('default-src', "'self'")
    .directive('object-src', "'none'")
    .directive('base-uri', "'self'")
    .directive('frame-ancestors', "'none'");
}
