/**
 * SecurityHeaders — parse and verify response security headers
 * against a policy.
 *
 * Covers the pragmatic set:
 *  - Content-Security-Policy  — parsed into `directive → sources[]`;
 *                               verifies required directives exist and
 *                               forbidden sources don't appear.
 *  - Strict-Transport-Security — `max-age` floor, `includeSubDomains`,
 *                               `preload` requirements.
 *  - X-Frame-Options          — exact DENY/SAMEORIGIN match.
 *  - X-Content-Type-Options   — must be `nosniff`.
 *  - Referrer-Policy          — must be in an allowed set.
 *
 * Findings are graded: `missing` (header absent), `invalid` (present
 * but unparseable/wrong), `weak` (parseable but under policy), `ok`.
 * A report is `compliant` when no missing/invalid findings exist —
 * `weak` is a warning posture (deployable) vs `invalid` (broken).
 *
 * The CSP parser is a real parser, not a string-contains check:
 * directives split on `;`, each becomes name + source list, values
 * are unquoted-compared where the grammar requires (`'self'` is
 * literally quoted — that's the spec).
 *
 * @module SecurityLayer/Engine
 */

import {
  HeaderFinding,
  SecurityHeaderPolicy,
  SecurityHeaderReport,
} from './types';

/** Header lookup names are canonicalized lower-case on input. */
function getHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

/** Parse `d1 v1 v2; d2 v3` → Map<name, values[]>. */
function parseCsp(value: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of value.split(';')) {
    const trimmed = dir.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const name = parts[0].toLowerCase();
    out.set(name, parts.slice(1));
  }
  return out;
}

export class SecurityHeaders {
  private readonly _policy: SecurityHeaderPolicy;

  constructor(policy: SecurityHeaderPolicy) {
    this._policy = policy;
  }

  /* ---------------------------------------------------------------- */
  /* Evaluation                                                        */
  /* ---------------------------------------------------------------- */

  /** Verify a response's headers against the policy. */
  verify(headers: Readonly<Record<string, string>>): SecurityHeaderReport {
    const findings: HeaderFinding[] = [];
    let csp: Map<string, readonly string[]> | undefined;

    if (this._policy.contentSecurityPolicy) {
      const result = this._checkCsp(getHeader(headers, 'content-security-policy'));
      findings.push(...result.findings);
      csp = result.csp;
    }
    if (this._policy.strictTransportSecurity) {
      findings.push(
        this._checkHsts(getHeader(headers, 'strict-transport-security'))
      );
    }
    if (this._policy.xFrameOptions) {
      findings.push(
        this._checkXfo(getHeader(headers, 'x-frame-options'))
      );
    }
    if (this._policy.xContentTypeOptions) {
      findings.push(
        this._checkXcto(getHeader(headers, 'x-content-type-options'))
      );
    }
    if (this._policy.referrerPolicy) {
      findings.push(
        this._checkReferrer(getHeader(headers, 'referrer-policy'))
      );
    }

    const compliant = !findings.some(
      (f) => f.severity === 'missing' || f.severity === 'invalid'
    );
    return { findings, compliant, csp };
  }

  /* ---------------------------------------------------------------- */
  /* Per-header checks                                                 */
  /* ---------------------------------------------------------------- */

  private _checkCsp(value: string | undefined): {
    findings: HeaderFinding[];
    csp: Map<string, readonly string[]> | undefined;
  } {
    const policy = this._policy.contentSecurityPolicy;
    if (value === undefined) {
      return {
        findings: [{ header: 'content-security-policy', severity: 'missing', detail: 'header absent' }],
        csp: undefined,
      };
    }
    const csp = parseCsp(value);
    const findings: HeaderFinding[] = [];

    if (csp.size === 0) {
      findings.push({ header: 'content-security-policy', severity: 'invalid', detail: 'header present but no directives parsed' });
      return { findings, csp };
    }

    for (const req of policy?.requiredDirectives ?? []) {
      if (!csp.has(req.toLowerCase())) {
        findings.push({
          header: 'content-security-policy',
          severity: 'weak',
          detail: `required directive '${req}' absent`,
        });
      }
    }
    for (const forb of policy?.forbiddenDirectives ?? []) {
      if (csp.has(forb.toLowerCase())) {
        findings.push({
          header: 'content-security-policy',
          severity: 'weak',
          detail: `forbidden directive '${forb}' present`,
        });
      }
    }
    for (const src of policy?.forbiddenSources ?? []) {
      for (const [dir, sources] of csp) {
        if (sources.includes(src)) {
          findings.push({
            header: 'content-security-policy',
            severity: 'weak',
            detail: `forbidden source '${src}' in directive '${dir}'`,
          });
        }
      }
    }
    if (findings.length === 0) {
      findings.push({ header: 'content-security-policy', severity: 'ok', detail: 'policy satisfied' });
    }
    return { findings, csp };
  }

  private _checkHsts(value: string | undefined): HeaderFinding {
    const policy = this._policy.strictTransportSecurity;
    if (value === undefined) {
      return { header: 'strict-transport-security', severity: 'missing', detail: 'header absent' };
    }
    // `max-age=N[; includeSubDomains][; preload]`
    const maxAgeMatch = /max-age\s*=\s*(\d+)/i.exec(value);
    if (!maxAgeMatch) {
      return { header: 'strict-transport-security', severity: 'invalid', detail: 'missing max-age directive' };
    }
    const maxAge = parseInt(maxAgeMatch[1], 10);
    if (policy?.minMaxAge !== undefined && maxAge < policy.minMaxAge) {
      return {
        header: 'strict-transport-security',
        severity: 'weak',
        detail: `max-age ${maxAge} below required ${policy.minMaxAge}`,
      };
    }
    if (policy?.requireIncludeSubDomains && !/includesubdomains/i.test(value)) {
      return { header: 'strict-transport-security', severity: 'weak', detail: 'includeSubDomains required but absent' };
    }
    if (policy?.requirePreload && !/\bpreload\b/i.test(value)) {
      return { header: 'strict-transport-security', severity: 'weak', detail: 'preload required but absent' };
    }
    return { header: 'strict-transport-security', severity: 'ok', detail: `max-age ${maxAge}` };
  }

  private _checkXfo(value: string | undefined): HeaderFinding {
    const want = this._policy.xFrameOptions as string;
    if (value === undefined) {
      return { header: 'x-frame-options', severity: 'missing', detail: 'header absent' };
    }
    const got = value.trim().toUpperCase();
    if (got !== 'DENY' && got !== 'SAMEORIGIN') {
      return { header: 'x-frame-options', severity: 'invalid', detail: `unrecognized value '${value}'` };
    }
    if (got !== want.toUpperCase()) {
      return { header: 'x-frame-options', severity: 'weak', detail: `policy requires ${want}, got ${got}` };
    }
    return { header: 'x-frame-options', severity: 'ok', detail: got };
  }

  private _checkXcto(value: string | undefined): HeaderFinding {
    if (value === undefined) {
      return { header: 'x-content-type-options', severity: 'missing', detail: 'header absent' };
    }
    if (value.trim().toLowerCase() !== 'nosniff') {
      return { header: 'x-content-type-options', severity: 'invalid', detail: `expected 'nosniff', got '${value}'` };
    }
    return { header: 'x-content-type-options', severity: 'ok', detail: 'nosniff' };
  }

  private _checkReferrer(value: string | undefined): HeaderFinding {
    const allowed = this._policy.referrerPolicy ?? [];
    if (value === undefined) {
      return { header: 'referrer-policy', severity: 'missing', detail: 'header absent' };
    }
    const got = value.trim().toLowerCase();
    if (!allowed.map((a) => a.toLowerCase()).includes(got)) {
      return {
        header: 'referrer-policy',
        severity: 'weak',
        detail: `'${got}' not in allowed set [${allowed.join(', ')}]`,
      };
    }
    return { header: 'referrer-policy', severity: 'ok', detail: got };
  }
}
