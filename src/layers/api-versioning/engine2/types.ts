/**
 * API Versioning Engine2 — shared types.
 *
 * Type definitions for the lifecycle-automation module: version
 * deprecation scheduling, per-client usage tracking, structural
 * breaking-change detection across request/response schemas,
 * version-scoped rate limiting and migration-guide generation.
 *
 * All engines take an injectable {@link IClock} so lifecycle timing
 * is deterministic under test.
 *
 * @module ApiVersioningLayer/Engine2
 */

/** Injectable clock — every engine in engine2 is deterministic under test. */
export interface IClock {
  now(): number;
}

/** Default wall-clock implementation. */
export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/** Mutable test clock — call {@link TestClock.advance} to move time. */
export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

/** One day in milliseconds — convenience constant for schedule math. */
export const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Version lifecycle
// ---------------------------------------------------------------------------

/**
 * Lifecycle phases a published API version moves through.
 *
 *   draft -> active -> deprecated -> sunset -> retired
 *
 * `deprecated` versions still serve traffic but emit warnings;
 * `sunset` versions serve traffic with hard warnings and a deadline;
 * `retired` versions are removed entirely (410 Gone territory).
 */
export enum VersionPhase {
  Draft = 'draft',
  Active = 'active',
  Deprecated = 'deprecated',
  Sunset = 'sunset',
  Retired = 'retired',
}

/** Numeric rank for monotonic phase transitions (no going backwards). */
export const PHASE_RANK: Readonly<Record<VersionPhase, number>> = {
  [VersionPhase.Draft]: 0,
  [VersionPhase.Active]: 1,
  [VersionPhase.Deprecated]: 2,
  [VersionPhase.Sunset]: 3,
  [VersionPhase.Retired]: 4,
};

/** One scheduled future transition. */
export interface PendingTransition {
  phase: VersionPhase;
  at: number;
}

/** Full lifecycle record for one API version. */
export interface VersionLifecycle {
  /** Version identifier, e.g. "v1", "2.3.0". */
  version: string;
  /** Current lifecycle phase. */
  phase: VersionPhase;
  /** Epoch ms when the version entered {@link phase}. */
  phaseSince: number;
  /** Scheduled epoch ms for the *nearest* upcoming transition, if any. */
  nextTransitionAt: number | null;
  /** Phase the version will enter at {@link nextTransitionAt}. */
  nextPhase: VersionPhase | null;
  /**
   * All scheduled future transitions, sorted by `at` ascending.
   * `nextPhase`/`nextTransitionAt` mirror the head of this queue.
   */
  pending: PendingTransition[];
  /** Ordered history of (phase, timestamp) transitions. */
  history: Array<{ phase: VersionPhase; at: number }>;
}

/** A scheduled notification fired when a lifecycle event occurs. */
export interface LifecycleNotice {
  /** Notice id. */
  id: string;
  /** Version the notice concerns. */
  version: string;
  /** Why the notice was emitted. */
  kind: 'deprecation-announced' | 'sunset-approaching' | 'sunset' | 'retired';
  /** Epoch ms when the notice was emitted. */
  emittedAt: number;
  /** Human-readable message. */
  message: string;
}

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

/** A single recorded API call. */
export interface UsageRecord {
  clientId: string;
  version: string;
  endpoint: string;
  at: number;
}

/** Aggregated usage for one (client, version) pair. */
export interface ClientVersionUsage {
  clientId: string;
  version: string;
  calls: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

// ---------------------------------------------------------------------------
// Schema / breaking-change detection
// ---------------------------------------------------------------------------

/**
 * Minimal structural schema node — deliberately close to JSON Schema's
 * `type`/`properties`/`required`/`items`/`enum` subset so real schemas
 * can be projected into it, without the full JSON Schema machinery.
 */
export interface SchemaNode {
  /** JSON type tag. Absence means "any type". */
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  /** For object nodes: property name -> schema. */
  properties?: Readonly<Record<string, SchemaNode>>;
  /** For object nodes: names of required properties. */
  required?: readonly string[];
  /** For array nodes: schema of each element. */
  items?: SchemaNode;
  /** Allowed literal values; narrowing enum membership is breaking. */
  enum?: readonly (string | number | boolean)[];
  /** Whether additional (undeclared) properties are allowed. Default true. */
  additionalProperties?: boolean;
}

export enum ChangeKind {
  /**
   * A contract change that can break existing clients: removed property,
   * type change, widened requirement, narrowed enum, tightened additionalProperties.
   */
  Breaking = 'breaking',
  /** Additive change — safe for existing clients. */
  NonBreaking = 'non-breaking',
}

/** One detected difference between two schema versions. */
export interface SchemaChange {
  kind: ChangeKind;
  /** Dotted path, e.g. "user.address.zip". Root = "". */
  path: string;
  /** What changed at {@link path}. */
  reason:
    | 'property-removed'
    | 'property-added'
    | 'type-changed'
    | 'became-required'
    | 'became-optional'
    | 'enum-narrowed'
    | 'enum-widened'
    | 'additional-props-closed'
    | 'items-changed';
  /** Old value (when relevant). */
  before?: string;
  /** New value (when relevant). */
  after?: string;
}

/** Direction of comparison — which side must satisfy which. */
export enum SchemaDirection {
  /**
   * Request schemas: the server ACCEPTS this shape. Removing an accepted
   * property or tightening constraints is breaking (clients may send it).
   */
  Request = 'request',
  /**
   * Response schemas: the server PRODUCES this shape. Removing a produced
   * property or changing its type is breaking (clients may read it).
   */
  Response = 'response',
}

/** Result of diffing two endpoint schemas. */
export interface SchemaDiff {
  direction: SchemaDirection;
  changes: SchemaChange[];
  /** True iff at least one {@link ChangeKind.Breaking} change exists. */
  hasBreaking: boolean;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Quota applied to one version. */
export interface VersionRateLimit {
  version: string;
  /** Max calls in the window. */
  maxCalls: number;
  /** Window size in ms (sliding log). */
  windowMs: number;
}

/** Outcome of a rate-limit check. */
export interface RateLimitVerdict {
  allowed: boolean;
  /** Calls remaining in the current window. */
  remaining: number;
  /** Epoch ms when the oldest call in the window expires (retry-after hint). */
  retryAt: number | null;
}
