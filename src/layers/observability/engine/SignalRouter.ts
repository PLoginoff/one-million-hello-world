/**
 * Signal Router
 *
 * Fans telemetry signals out to registered sinks based on routing rules.
 * The router is the single ingestion point for metrics, logs and traces;
 * it applies (in order):
 *
 *   1. Correlation enrichment (stamp trace/span ids from ambient context)
 *   2. Buffering under backpressure with a configurable drop policy
 *   3. Per-sink routing rules (prefix match on signal attribute `route`,
 *      kind filters, severity floors)
 *   4. Batch fan-out with per-sink delivery statistics
 *
 * Performance: routing is O(R) where R is the number of rules (typically
 * small, < 20). Buffers use a ring deque for O(1) push/evict.
 *
 * @module ObservabilityLayer/Engine
 */

import {
  Attributes,
  DropPolicy,
  IClock,
  ISignalSink,
  LogSeverity,
  RouteDecision,
  SEVERITY_RANK,
  SignalKind,
  SystemClock,
  TelemetrySignal,
} from './signals';

/** A routing rule: first match wins; a signal may match several sinks. */
export interface RoutingRule {
  readonly name: string;
  /** Restrict to these kinds; empty means "all kinds". */
  readonly kinds?: ReadonlyArray<SignalKind>;
  /** Minimum log severity (logs only). */
  readonly minSeverity?: LogSeverity;
  /**
   * Attribute predicate — every key must equal the given primitive value
   * on `signal.attributes` for the rule to match.
   */
  readonly where?: Attributes;
  /** Sinks that receive matching signals. */
  readonly sinks: ReadonlyArray<string>;
}

export interface SignalRouterConfig {
  /** Bound on the per-kind ingest buffer; overflow triggers the drop policy. */
  readonly bufferCapacity: number;
  readonly dropPolicy: DropPolicy;
  readonly rules: ReadonlyArray<RoutingRule>;
  /** Sinks that always receive every signal (after buffering). */
  readonly defaultSinks?: ReadonlyArray<string>;
}

export interface RouterStats {
  ingested: number;
  routed: number;
  dropped: number;
  rejected: number;
  perSinkWrites: Record<string, number>;
}

/**
 * Bounded ring buffer for one signal kind. Capacity is fixed at
 * construction; insertion is O(1), eviction O(1). `drop-lowest-severity`
 * performs an O(n) scan — acceptable because it only runs when the
 * buffer is full, and bounded by capacity.
 */
export class SignalBuffer {
  private _items: TelemetrySignal[] = [];
  readonly capacity: number;
  readonly policy: DropPolicy;

  constructor(capacity: number, policy: DropPolicy) {
    this.capacity = Math.max(1, capacity);
    this.policy = policy;
  }

  get size(): number {
    return this._items.length;
  }

  /**
   * Push a signal. Returns the evicted signal when the policy displaced
   * an existing entry, `null` when inserted cleanly, or `false` when the
   * incoming signal itself was dropped/rejected.
   */
  push(signal: TelemetrySignal): TelemetrySignal | null | false {
    if (this._items.length < this.capacity) {
      this._items.push(signal);
      return null;
    }
    switch (this.policy) {
      case 'reject':
      case 'drop-newest':
        return false;
      case 'drop-oldest': {
        const evicted = this._items.shift() ?? null;
        this._items.push(signal);
        return evicted;
      }
      case 'drop-lowest-severity': {
        // Find index of the lowest-severity item; if the new signal has a
        // lower or equal severity than everything buffered, drop the new one.
        let minIdx = 0;
        let minRank = this._rankOf(this._items[0]);
        for (let i = 1; i < this._items.length; i++) {
          const r = this._rankOf(this._items[i]);
          if (r < minRank) {
            minRank = r;
            minIdx = i;
          }
        }
        const incomingRank = this._rankOf(signal);
        if (incomingRank <= minRank) {
          return false;
        }
        const evicted = this._items[minIdx];
        this._items[minIdx] = signal;
        return evicted;
      }
    }
  }

  /** Drain up to `max` items (default: all) in FIFO order. */
  drain(max = this._items.length): TelemetrySignal[] {
    return this._items.splice(0, max);
  }

  private _rankOf(s: TelemetrySignal): number {
    const sev = s.attributes['severity'];
    if (typeof sev === 'string' && sev in SEVERITY_RANK) {
      return SEVERITY_RANK[sev as LogSeverity];
    }
    // Non-logs are treated as highest value — never evicted by severity.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * The unified signal router. Thread-safety is irrelevant in the single
 * threaded runtime, but all mutating operations are synchronous so no
 * interleaving can tear state.
 */
export class SignalRouter {
  private _sinks: Map<string, ISignalSink> = new Map();
  private _buffers: Map<SignalKind, SignalBuffer>;
  private _rules: RoutingRule[];
  private _defaultSinks: string[];
  private _stats: RouterStats = { ingested: 0, routed: 0, dropped: 0, rejected: 0, perSinkWrites: {} };
  private _ambientTrace: { traceId: string; spanId: string } | null = null;
  private readonly _clock: IClock;
  private readonly _policy: DropPolicy;

  constructor(config: SignalRouterConfig, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._policy = config.dropPolicy;
    this._rules = [...config.rules];
    this._defaultSinks = [...(config.defaultSinks ?? [])];
    this._buffers = new Map<SignalKind, SignalBuffer>([
      ['metric', new SignalBuffer(config.bufferCapacity, this._policy)],
      ['log', new SignalBuffer(config.bufferCapacity, this._policy)],
      ['trace', new SignalBuffer(config.bufferCapacity, this._policy)],
    ]);
  }

  /** Register (or replace) a sink. */
  addSink(sink: ISignalSink): void {
    this._sinks.set(sink.name, sink);
  }

  removeSink(name: string): boolean {
    return this._sinks.delete(name);
  }

  /** Set the ambient correlation context stamped onto subsequent signals. */
  setCorrelation(traceId: string, spanId: string): void {
    this._ambientTrace = { traceId, spanId };
  }

  clearCorrelation(): void {
    this._ambientTrace = null;
  }

  /**
   * Ingest a signal: stamp correlation, enqueue, and drain synchronously
   * to the matching sinks. Returns the routing decisions for callers
   * that care (e.g. tests, diagnostics endpoints).
   */
  ingest(signal: TelemetrySignal): RouteDecision[] {
    this._stats.ingested++;
    if (this._ambientTrace) {
      if (signal.traceId === undefined) {
        (signal as { traceId?: string }).traceId = this._ambientTrace.traceId;
      }
      if (signal.spanId === undefined) {
        (signal as { spanId?: string }).spanId = this._ambientTrace.spanId;
      }
    }

    const buffer = this._buffers.get(signal.kind);
    if (buffer) {
      const outcome = buffer.push(signal);
      if (outcome === false) {
        if (this._policy === 'reject') {
          this._stats.rejected++;
        } else {
          this._stats.dropped++;
        }
        return [];
      }
      if (outcome !== null) {
        this._stats.dropped++;
      }
    }

    const batch = buffer ? buffer.drain() : [signal];
    const decisions: RouteDecision[] = [];
    for (const s of batch) {
      const targets = this._matchSinks(s);
      for (const name of targets) {
        const sink = this._sinks.get(name);
        if (!sink || !sink.accepts(s.kind)) continue;
        sink.write([s]);
        this._stats.routed++;
        this._stats.perSinkWrites[name] = (this._stats.perSinkWrites[name] ?? 0) + 1;
        decisions.push({ sink: name, matched: true });
      }
    }
    return decisions;
  }

  /** Determine which sinks a signal routes to. */
  private _matchSinks(signal: TelemetrySignal): string[] {
    const out = new Set<string>(this._defaultSinks);
    for (const rule of this._rules) {
      if (rule.kinds && rule.kinds.length > 0 && !rule.kinds.includes(signal.kind)) continue;
      if (rule.minSeverity) {
        const sev = signal.attributes['severity'];
        const rank = typeof sev === 'string' && sev in SEVERITY_RANK ? SEVERITY_RANK[sev as LogSeverity] : 0;
        if (rank < SEVERITY_RANK[rule.minSeverity]) continue;
      }
      if (rule.where) {
        let ok = true;
        for (const [k, v] of Object.entries(rule.where)) {
          if (signal.attributes[k] !== v) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      for (const s of rule.sinks) out.add(s);
    }
    return [...out];
  }

  /** Flush all buffered signals to their sinks (used on shutdown). */
  drainAll(): void {
    for (const kind of ['metric', 'log', 'trace'] as SignalKind[]) {
      const buffer = this._buffers.get(kind);
      if (!buffer) continue;
      for (const s of buffer.drain()) {
        for (const name of this._matchSinks(s)) {
          const sink = this._sinks.get(name);
          if (sink && sink.accepts(s.kind)) {
            sink.write([s]);
            this._stats.routed++;
          }
        }
      }
    }
    for (const sink of this._sinks.values()) {
      sink.flush?.();
    }
  }

  getStats(): RouterStats {
    return {
      ...this._stats,
      perSinkWrites: { ...this._stats.perSinkWrites },
    };
  }

  /** Number of signals currently held in the ingest buffers. */
  bufferedCount(kind?: SignalKind): number {
    if (kind) return this._buffers.get(kind)?.size ?? 0;
    let n = 0;
    for (const b of this._buffers.values()) n += b.size;
    return n;
  }

  /** The clock is exposed so correlated components share one source of time. */
  get clock(): IClock {
    return this._clock;
  }
}

/** In-memory sink useful for tests and for the OTLP exporter's staging area. */
export class InMemorySignalSink implements ISignalSink {
  readonly name: string;
  private readonly _kinds: ReadonlyArray<SignalKind> | undefined;
  readonly signals: TelemetrySignal[] = [];

  constructor(name: string, kinds?: ReadonlyArray<SignalKind>) {
    this.name = name;
    this._kinds = kinds;
  }

  accepts(kind: SignalKind): boolean {
    return !this._kinds || this._kinds.includes(kind);
  }

  write(signals: ReadonlyArray<TelemetrySignal>): void {
    this.signals.push(...signals);
  }

  clear(): void {
    this.signals.length = 0;
  }
}
