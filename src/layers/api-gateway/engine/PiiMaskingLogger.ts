/**
 * Access Logger with PII Masking
 *
 * Structured request/response logger. Before a record is stored it is
 * passed through a masker that redacts:
 *  - headers by name (authorization, cookie, set-cookie, x-api-key, ...)
 *  - JSON-ish body fields by name (password, ssn, token, email, ...)
 *  - patterns matching common PII shapes (emails, card numbers, bearer tokens)
 *
 * Records are kept in a bounded ring buffer — O(1) append, O(1)
 * eviction of the oldest entry — plus an index by request id.
 *
 * @module ApiGatewayLayer/Engine
 */

import { GatewayClock, SystemGatewayClock } from './types';

/** A single masked log entry. */
export interface AccessLogEntry {
  readonly requestId: string;
  readonly timestamp: number;
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly consumerId?: string;
  readonly routeId?: string;
  readonly latencyMs?: number;
  readonly headers: Record<string, string[]>;
  /** Masked body snapshot (redacted fields replaced). */
  readonly body?: unknown;
  readonly error?: string;
  readonly meta?: Record<string, unknown>;
}

/** Sink abstraction — tests can capture records; prod could write to a stream. */
export interface LogSink {
  write(entry: AccessLogEntry): void;
}

/** Sink that stores entries in memory. */
export class InMemoryLogSink implements LogSink {
  readonly entries: AccessLogEntry[] = [];
  write(entry: AccessLogEntry): void {
    this.entries.push(entry);
  }
}

/** Masking configuration. */
export interface PiiMaskingConfig {
  /** Header names (lower-case) to fully redact. */
  readonly maskedHeaders: readonly string[];
  /** Body field names to mask at any nesting depth. */
  readonly maskedFields: readonly string[];
  /** Replacement string for masked values. */
  readonly replacement: string;
  /** Additional regex patterns; each match is masked. */
  readonly bodyPatterns: readonly RegExp[];
}

const DEFAULT_MASKED_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
];

const DEFAULT_MASKED_FIELDS = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'ssn',
  'creditcard',
  'card_number',
  'cvv',
  'email',
];

const DEFAULT_BODY_PATTERNS: RegExp[] = [
  // Email addresses
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Bearer tokens in free text
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // 13-19 digit card-like numbers (Luhn-ish shape, not verified)
  /\b\d{13,19}\b/g,
];

export const DEFAULT_PII_MASKING_CONFIG: PiiMaskingConfig = {
  maskedHeaders: DEFAULT_MASKED_HEADERS,
  maskedFields: DEFAULT_MASKED_FIELDS,
  replacement: '***',
  bodyPatterns: DEFAULT_BODY_PATTERNS,
};

/**
 * Recursively mask an unknown-typed value.
 *
 * - Strings are scanned with the configured regex patterns.
 * - Plain objects have fields whose normalized name (lower-cased,
 *   non-alphanumerics stripped) matches `maskedFields` replaced.
 * - Arrays and nested objects are handled recursively.
 *
 * Returns a new value — input is never mutated. Cyclic structures are
 * collapsed to "[Circular]".
 */
export function maskValue(value: unknown, config: PiiMaskingConfig, seen?: Set<unknown>): unknown {
  const visited = seen ?? new Set<unknown>();
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of config.bodyPatterns) {
      out = out.replace(pattern, config.replacement);
    }
    return out;
  }
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return '[Circular]';
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => maskValue(v, config, visited));
  }

  const fieldSet = new Set(
    config.maskedFields.map((f) => f.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fieldSet.has(norm)) {
      out[k] = config.replacement;
    } else {
      out[k] = maskValue(v, config, visited);
    }
  }
  return out;
}

/** Mask a header map. */
export function maskHeaders(
  headers: Record<string, string[]>,
  config: PiiMaskingConfig
): Record<string, string[]> {
  const blocked = new Set(config.maskedHeaders.map((h) => h.toLowerCase()));
  const out: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(headers)) {
    out[name] = blocked.has(name.toLowerCase())
      ? [config.replacement]
      : [...values];
  }
  return out;
}

/**
 * Access logger with ring-buffer retention.
 */
export class AccessLogger {
  private _capacity: number;
  private _buffer: (AccessLogEntry | undefined)[];
  private _head: number;
  private _count: number;
  private _byRequestId: Map<string, AccessLogEntry>;
  private _config: PiiMaskingConfig;
  private _clock: GatewayClock;
  private _sinks: LogSink[];

  constructor(options?: {
    capacity?: number;
    masking?: Partial<PiiMaskingConfig>;
    clock?: GatewayClock;
    sinks?: LogSink[];
  }) {
    this._capacity = Math.max(1, options?.capacity ?? 10_000);
    this._buffer = new Array<AccessLogEntry | undefined>(this._capacity);
    this._head = 0;
    this._count = 0;
    this._byRequestId = new Map();
    this._config = { ...DEFAULT_PII_MASKING_CONFIG, ...options?.masking };
    this._clock = options?.clock ?? new SystemGatewayClock();
    this._sinks = options?.sinks ?? [];
  }

  /**
   * Record an entry (already partially assembled by the caller).
   * Headers and body are masked here before retention/emit.
   */
  record(input: Omit<AccessLogEntry, 'timestamp' | 'headers' | 'body'> & {
    headers: Record<string, string[]>;
    body?: unknown;
    timestamp?: number;
  }): AccessLogEntry {
    const entry: AccessLogEntry = {
      ...input,
      timestamp: input.timestamp ?? this._clock.now(),
      headers: maskHeaders(input.headers, this._config),
      body: maskValue(input.body, this._config),
    };

    // Ring-buffer insert; evicted entries are dropped from the id index.
    const evicted = this._buffer[this._head];
    if (evicted) {
      this._byRequestId.delete(evicted.requestId);
    }
    this._buffer[this._head] = entry;
    this._head = (this._head + 1) % this._capacity;
    this._count = Math.min(this._count + 1, this._capacity);
    this._byRequestId.set(entry.requestId, entry);

    for (const sink of this._sinks) {
      try {
        sink.write(entry);
      } catch {
        // sinks must not break request handling
      }
    }
    return entry;
  }

  /** Look up an entry by request id. O(1). */
  getByRequestId(requestId: string): AccessLogEntry | undefined {
    return this._byRequestId.get(requestId);
  }

  /**
   * Recent entries in chronological order (oldest retained first).
   * O(n) where n = retained entries.
   */
  entries(): AccessLogEntry[] {
    const out: AccessLogEntry[] = [];
    for (let i = 0; i < this._count; i++) {
      const idx = (this._head - this._count + i + this._capacity) % this._capacity;
      const e = this._buffer[idx];
      if (e) out.push(e);
    }
    return out;
  }

  /** Simple query: filter by predicate over retained entries. */
  query(predicate: (entry: AccessLogEntry) => boolean): AccessLogEntry[] {
    return this.entries().filter(predicate);
  }

  /** Number of retained entries. */
  size(): number {
    return this._count;
  }
}
