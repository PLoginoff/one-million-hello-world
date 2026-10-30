/**
 * Security Engine — shared types.
 *
 * Vocabulary:
 * - `ThreatRule`          — one signature: a regex/substring probe
 *                           against named request surfaces plus a
 *                           severity + priority.
 * - `ThreatRulesEngine`   — evaluates an ordered rule set against a
 *                           request, short-circuiting on critical.
 * - `RequestSigner`       — HMAC-SHA256 canonical-request signing with
 *                           timestamp-window and nonce replay defense.
 * - `IpReputation`        — sliding-window scoring per IP: decaying
 *                           event history → score → verdict.
 * - `SecurityHeaders`     — parses and verifies CSP / HSTS /
 *                           X-Frame-Options and friends against a
 *                           policy.
 *
 * @module SecurityLayer/Engine
 */

import { SecurityError } from '../utils/SecurityError';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface SecurityClock {
  now(): number;
}

export class SystemSecurityClock implements SecurityClock {
  now(): number {
    return Date.now();
  }
}

export class ManualSecurityClock implements SecurityClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class SignatureVerificationError extends SecurityError {
  constructor(reason: string) {
    super('SIGNATURE_VERIFICATION', `Request signature invalid: ${reason}`, 401);
    this.name = 'SignatureVerificationError';
  }
}

/* ------------------------------------------------------------------ */
/* Threat detection                                                    */
/* ------------------------------------------------------------------ */

/** Where a rule's pattern is applied. */
export const enum ThreatSurface {
  PATH = 'path',
  QUERY = 'query',
  BODY = 'body',
  HEADERS = 'headers',
  COOKIES = 'cookies',
  USER_AGENT = 'user-agent',
  ALL_TEXT = 'all-text',
}

export const enum ThreatCategory {
  SQL_INJECTION = 'sqli',
  XSS = 'xss',
  PATH_TRAVERSAL = 'path-traversal',
  COMMAND_INJECTION = 'cmdi',
  PROTOCOL_VIOLATION = 'protocol',
  SCANNER = 'scanner',
  CUSTOM = 'custom',
}

export const enum ThreatSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Numeric severity ordering for comparisons. */
export const SEVERITY_ORDER: Readonly<Record<ThreatSeverity, number>> = {
  [ThreatSeverity.INFO]: 0,
  [ThreatSeverity.LOW]: 1,
  [ThreatSeverity.MEDIUM]: 2,
  [ThreatSeverity.HIGH]: 3,
  [ThreatSeverity.CRITICAL]: 4,
};

/**
 * One detection signature. Patterns are precompiled at construction —
 * a rules engine that recompiles regexes per request is a latency
 * bug, not a feature.
 */
export interface ThreatRule {
  readonly id: string;
  readonly category: ThreatCategory;
  readonly severity: ThreatSeverity;
  /**
   * Evaluation priority: lower runs first. Ordering matters for two
   * reasons — cheap substring rules should precede expensive regexes,
   * and a CRITICAL match short-circuits the whole evaluation.
   */
  readonly priority: number;
  /** Surfaces probed; empty = ALL_TEXT. */
  readonly surfaces: readonly ThreatSurface[];
  /** Regex sources (tested with `.test()`). */
  readonly patterns: readonly string[];
  /** Case-insensitive match. Default true for attack signatures. */
  readonly caseInsensitive?: boolean;
  /** Optional human description surfaced in matches. */
  readonly description?: string;
}

/** The request data offered to the rules engine. */
export interface ThreatRequest {
  readonly path?: string;
  readonly query?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: Readonly<Record<string, string>>;
  readonly userAgent?: string;
  readonly method?: string;
  readonly ip?: string;
}

export interface ThreatMatch {
  readonly ruleId: string;
  readonly category: ThreatCategory;
  readonly severity: ThreatSeverity;
  /** Surface where the pattern hit. */
  readonly surface: ThreatSurface;
  /** The matched text (for logging; may be sensitive — handle with care). */
  readonly evidence: string;
  readonly description?: string;
}

export interface ThreatEvaluation {
  readonly matches: readonly ThreatMatch[];
  /** Highest severity observed; INFO when matches is empty. */
  readonly maxSeverity: ThreatSeverity;
  /** True when any match meets/exceeds `blockAt` severity. */
  readonly blocked: boolean;
  /** Microseconds spent evaluating (hrtime-free clock diff). */
  readonly evaluatedInMs: number;
}

/* ------------------------------------------------------------------ */
/* Request signing                                                     */
/* ------------------------------------------------------------------ */

export interface CanonicalRequest {
  readonly method: string;
  /** Path only — no scheme/host/query. */
  readonly path: string;
  /** Raw query string, canonicalized internally (sorted params). */
  readonly query?: string;
  /** Header subset included in the signature. */
  readonly headers: Readonly<Record<string, string>>;
  /** Body bytes or their hex SHA-256 (pre-hashed by caller). */
  readonly payloadHash: string;
  /** Unix-epoch seconds when the request was signed. */
  readonly timestamp: number;
  /** Optional nonce for replay defense. */
  readonly nonce?: string;
}

export interface SigningKey {
  readonly keyId: string;
  readonly secret: string;
  /** Algorithm tag — only 'hmac-sha256' implemented. */
  readonly algorithm?: string;
}

export interface RequestSignerOptions {
  /**
   * Allowed clock skew between the request timestamp and the server
   * clock, in seconds. Default 300 (AWS's convention).
   */
  readonly timestampWindowSec?: number;
  /** Headers that must be present in `headers`. */
  readonly requiredHeaders?: readonly string[];
  /** Nonce TTL for replay defense, seconds. 0 = off. */
  readonly nonceTtlSec?: number;
  /** Injectable clock. */
  readonly clock?: SecurityClock;
}

export interface SignatureResult {
  /** hex HMAC-SHA256 of the canonical string. */
  readonly signature: string;
  /** The exact canonical string that was signed (for debugging). */
  readonly canonical: string;
  readonly signedHeaders: readonly string[];
}

export interface VerificationResult {
  readonly ok: boolean;
  readonly reason?: 'bad-signature' | 'stale-timestamp' | 'future-timestamp' | 'replay' | 'missing-header';
  /** Skew between request timestamp and server clock, seconds. */
  readonly skewSec?: number;
}

/* ------------------------------------------------------------------ */
/* IP reputation                                                       */
/* ------------------------------------------------------------------ */

/** Event kinds that feed the reputation score. */
export const enum ReputationEvent {
  REQUEST = 'request',
  FAILED_AUTH = 'failed-auth',
  THREAT_MATCH = 'threat-match',
  RATE_LIMITED = 'rate-limited',
  MALFORMED = 'malformed',
  /** Positive signal — pulls the score toward 0. */
  GOOD_REQUEST = 'good-request',
}

export interface ReputationOptions {
  /** Window events live in, ms. Default 5 minutes. */
  readonly windowMs?: number;
  /** Score at/above which the verdict is 'block'. Default 100. */
  readonly blockThreshold?: number;
  /** Score at/above which the verdict is 'suspect'. Default 50. */
  readonly suspectThreshold?: number;
  /** Per-event weights; unspecified events weigh 0. */
  readonly weights?: Partial<Record<ReputationEvent, number>>;
  /** Injectable clock. */
  readonly clock?: SecurityClock;
}

export type ReputationVerdict = 'allow' | 'suspect' | 'block';

export interface ReputationScore {
  readonly ip: string;
  readonly score: number;
  readonly verdict: ReputationVerdict;
  /** Events contributing to the score (inside the window). */
  readonly eventsInWindow: number;
  /** Ms until the oldest event leaves the window; 0 when empty. */
  readonly windowExpiresInMs: number;
}

/* ------------------------------------------------------------------ */
/* Security headers                                                    */
/* ------------------------------------------------------------------ */

export interface SecurityHeaderPolicy {
  /**
   * Required directives per header. For CSP: required directive names
   * (e.g. `default-src`). For HSTS: required attributes
   * (`max-age`, `includeSubDomains`). For X-Frame-Options: the exact
   * required value ('DENY' | 'SAMEORIGIN').
   */
  readonly contentSecurityPolicy?: {
    readonly requiredDirectives?: readonly string[];
    readonly forbiddenDirectives?: readonly string[];
    /** Values that must not appear in any source list ('unsafe-inline'...). */
    readonly forbiddenSources?: readonly string[];
  };
  readonly strictTransportSecurity?: {
    readonly minMaxAge?: number;
    readonly requireIncludeSubDomains?: boolean;
    readonly requirePreload?: boolean;
  };
  readonly xFrameOptions?: 'DENY' | 'SAMEORIGIN';
  readonly xContentTypeOptions?: 'nosniff';
  readonly referrerPolicy?: readonly string[];
}

export interface HeaderFinding {
  readonly header: string;
  readonly severity: 'missing' | 'weak' | 'invalid' | 'ok';
  readonly detail: string;
}

export interface SecurityHeaderReport {
  readonly findings: readonly HeaderFinding[];
  /** True when no 'missing'/'invalid' findings exist. */
  readonly compliant: boolean;
  /** Parsed CSP directives when the header was present. */
  readonly csp?: ReadonlyMap<string, readonly string[]>;
}
