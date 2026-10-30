/**
 * Controller Engine — Shared Types
 *
 * Type definitions for the executable controller core:
 * - Schema-based DTO validation (decorator-free)
 * - Content-negotiated responses (JSON / CSV / plain by `Accept`)
 * - HATEOAS link records (RFC 8288 rels, templated hrefs)
 * - RFC 7807 `application/problem+json` output
 * - Request-context extraction (pagination / sorting / filtering)
 *
 * The domain/ tree models controller metadata; this module models the
 * request→response transformation itself.
 *
 * @module ControllerLayer/Engine
 */

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

/** Primitive + composite field kinds the validator understands. */
export type FieldKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum'
  | 'unknown';

/**
 * Schema rule for one DTO field.
 */
export interface FieldRule {
  /** Expected kind. `unknown` accepts anything (still checks required). */
  readonly kind: FieldKind;
  /** Missing-field behavior. */
  readonly required?: boolean;
  /** Allowed values for `kind: 'enum'`. */
  readonly values?: readonly unknown[];
  /** Nested schema for `kind: 'object'` / `kind: 'array'` (element schema). */
  readonly fields?: DtoSchema;
  readonly items?: FieldRule;
  /** String constraints. */
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp;
  /** Number constraints. */
  readonly min?: number;
  readonly max?: number;
  /** Array constraints. */
  readonly minItems?: number;
  readonly maxItems?: number;
  /** Custom validator — return an error string or null. */
  readonly validate?: (value: unknown) => string | null;
  /** Documentation hint surfaced in errors. */
  readonly description?: string;
}

/** Schema = map of field name → rule. */
export type DtoSchema = Record<string, FieldRule>;

/** One validation failure. */
export interface ValidationIssue {
  /** Dot-path to the offending field (`address.zip`). */
  readonly path: string;
  /** Machine-readable code (`required`, `type`, `min`, ...). */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** Observed value (sanitized: objects collapse to `{...}`). */
  readonly received?: unknown;
}

/** Validation result. */
export type ValidationOutcome =
  | { readonly valid: true; readonly issues: readonly ValidationIssue[] }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

/** Pagination parameters normalized from query input. */
export interface Pagination {
  /** 1-based page number. */
  readonly page: number;
  /** Items per page. */
  readonly pageSize: number;
  /** SQL-style offset (derived). */
  readonly offset: number;
  /** SQL-style limit (derived). */
  readonly limit: number;
}

/** One sort clause (`field` + direction). */
export interface SortClause {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

/** One parsed filter (`field op value`). */
export interface FilterClause {
  readonly field: string;
  readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  readonly value: string;
}

/** Fully-normalized request context. */
export interface RequestContext {
  readonly pagination: Pagination;
  readonly sort: readonly SortClause[];
  readonly filters: readonly FilterClause[];
  /** Non-parsed query params retained verbatim. */
  readonly extras: Record<string, string>;
}

/** Options controlling request-context extraction. */
export interface RequestContextOptions {
  readonly defaultPageSize?: number;
  readonly maxPageSize?: number;
  /** Allow-listed sortable fields; others are ignored. */
  readonly sortableFields?: readonly string[];
  /** Allow-listed filterable fields; others are ignored. */
  readonly filterableFields?: readonly string[];
}

// ---------------------------------------------------------------------------
// Content negotiation
// ---------------------------------------------------------------------------

/** One `Accept` header range with its quality value. */
export interface AcceptRange {
  readonly type: string;
  readonly subtype: string;
  /** Quality in [0, 1]. */
  readonly q: number;
  /** Position index in the original header (stability tiebreak). */
  readonly index: number;
}

/** Negotiable response body shapes. */
export type ResponseBody = unknown;

/** Serializer for a concrete media type. */
export interface BodySerializer {
  /** Media type produced (`application/json`, `text/csv`, ...). */
  readonly contentType: string;
  /** Serialize a body to wire text. */
  serialize(body: ResponseBody): string;
}

/** Structured response produced by the response builder. */
export interface NegotiatedResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  /** Negotiation metadata for debugging/logging. */
  readonly negotiation: {
    readonly selected: string;
    readonly candidates: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// HATEOAS
// ---------------------------------------------------------------------------

/** One RFC 8288 web link. */
export interface Link {
  /** Link relation (`self`, `next`, `prev`, `related`, `edit-form`, ...). */
  readonly rel: string;
  /** Concrete URI. */
  readonly href: string;
  /** Whether `href` is an RFC 6570 URI template (contains `{}`). */
  readonly templated?: boolean;
  /** Optional media type hint. */
  readonly type?: string;
  /** Optional human-readable title. */
  readonly title?: string;
  /** Optional HTTP method hint. */
  readonly method?: string;
}

/** A HAL-flavored resource envelope. */
export interface LinkedResource<T> {
  readonly data: T;
  readonly links: readonly Link[];
}

// ---------------------------------------------------------------------------
// RFC 7807 problem details
// ---------------------------------------------------------------------------

/** RFC 7807 `application/problem+json` document. */
export interface ProblemDetails {
  /** URI identifying the problem type (defaults to about:blank). */
  readonly type: string;
  /** Short human-readable summary. */
  readonly title: string;
  /** HTTP status code. */
  readonly status: number;
  /** Human-readable explanation specific to this occurrence. */
  readonly detail?: string;
  /** URI identifying this specific occurrence. */
  readonly instance?: string;
  /** Extension members (machine-readable context). */
  readonly extensions?: Record<string, unknown>;
}

/** Serialized problem response. */
export interface ProblemResponse {
  readonly status: number;
  readonly contentType: 'application/problem+json';
  readonly body: string;
  readonly problem: ProblemDetails;
}
