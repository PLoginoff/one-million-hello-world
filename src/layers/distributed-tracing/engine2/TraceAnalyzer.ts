/**
 * Trace Analyzer — tail sampling, link analysis, critical path, search.
 *
 * Operates on *complete* traces (`SpanSnapshot[]` grouped by traceId) —
 * the artifacts `TraceIngestion` emits after assembly. All algorithms
 * run over an in-memory DAG reconstructed from parent span ids.
 *
 * Critical path algorithm: the "critical" chain is the greedy longest-
 * duration path — walk up from the span that ends latest, choosing at
 * each level the child relationship that maximizes covered wall-clock.
 * Formally: cost(node) = duration(node) + max over children of
 *   cost(child) where child's window overlaps node's — the classic
 *   critical-path heuristic used by Jaeger's trace view.
 *
 * @module DistributedTracingLayer/Engine2
 */

import { SpanSnapshot, SpanTree } from '../engine/Span';
import {
  CriticalPath,
  CriticalPathStep,
  LinkReport,
  SamplingRule,
  ServiceEdge,
  ServiceNode,
  TailSamplingDecision,
  TraceQuery,
  TraceSummary,
} from './types';

const SERVICE_ATTR = 'service.name';
const UNKNOWN_SERVICE = 'unknown';

function serviceOf(s: SpanSnapshot): string {
  const v = s.attributes[SERVICE_ATTR];
  return typeof v === 'string' && v.length > 0 ? v : UNKNOWN_SERVICE;
}

function duration(s: SpanSnapshot): number {
  return s.endTimeMs - s.startTimeMs;
}

// ---------------------------------------------------------------------------
// Tail sampling — declarative rules evaluated per finished trace.
// ---------------------------------------------------------------------------

/**
 * Evaluates `SamplingRule`s in order; the first matching rule decides.
 * If nothing matches, `defaultKeep` applies (baseline behaviour).
 */
export class TailRuleEngine {
  private readonly _rules: ReadonlyArray<SamplingRule>;
  private readonly _defaultKeep: boolean;

  constructor(rules: ReadonlyArray<SamplingRule>, defaultKeep = false) {
    this._rules = rules;
    this._defaultKeep = defaultKeep;
  }

  decide(traceId: string, spans: ReadonlyArray<SpanSnapshot>): TailSamplingDecision {
    const traceDuration = traceWallClock(spans);
    for (const rule of this._rules) {
      if (matches(rule, spans, traceDuration)) {
        return {
          traceId,
          keep: rule.decision === 'keep',
          rule: rule.name ?? rule.kind,
          reason: describeMatch(rule, traceDuration, spans),
        };
      }
    }
    return {
      traceId,
      keep: this._defaultKeep,
      rule: 'default',
      reason: `no rule matched; default=${this._defaultKeep ? 'keep' : 'drop'}`,
    };
  }
}

function matches(rule: SamplingRule, spans: ReadonlyArray<SpanSnapshot>, wallMs: number): boolean {
  switch (rule.kind) {
    case 'latency-above':
      return wallMs >= (rule.thresholdMs ?? 0);
    case 'latency-below':
      return wallMs <= (rule.thresholdMs ?? Infinity);
    case 'has-error':
      return spans.some((s) => s.status.code === 'ERROR');
    case 'attribute-eq':
      return spans.some(
        (s) => rule.attributeKey !== undefined && s.attributes[rule.attributeKey] === rule.attributeValue,
      );
    case 'service':
      return spans.some((s) => serviceOf(s) === rule.serviceName);
    case 'always':
      return true;
    case 'never':
      return false;
  }
}

function describeMatch(rule: SamplingRule, wallMs: number, spans: ReadonlyArray<SpanSnapshot>): string {
  switch (rule.kind) {
    case 'latency-above':
      return `wall-clock ${wallMs}ms >= ${rule.thresholdMs}ms`;
    case 'latency-below':
      return `wall-clock ${wallMs}ms <= ${rule.thresholdMs}ms`;
    case 'has-error': {
      const bad = spans.filter((s) => s.status.code === 'ERROR');
      return `${bad.length} span(s) with ERROR status`;
    }
    case 'attribute-eq':
      return `attribute ${rule.attributeKey}=${String(rule.attributeValue)} present`;
    case 'service':
      return `service "${rule.serviceName}" participates`;
    case 'always':
      return 'unconditional';
    case 'never':
      return 'never matches';
  }
}

// ---------------------------------------------------------------------------
// Link analysis — service graph with fan-in/fan-out.
// ---------------------------------------------------------------------------

/**
 * Builds the service-level call graph from a corpus of traces.
 * An edge caller→callee exists wherever a span whose parent belongs to
 * a different service exists — i.e., we only count *cross-service*
 * hand-offs (intra-service nesting is collapsed).
 *
 * Complexity: O(S) spans to build edges, then O(E + V) to summarize.
 */
export class SpanLinkAnalyzer {
  private readonly _edges = new Map<string, { callerService: string; calleeService: string; calls: number; totalLatencyMs: number; errors: number }>();
  private readonly _spanCount = new Map<string, number>();
  private readonly _selfTime = new Map<string, number>();
  private readonly _callers = new Map<string, Set<string>>();
  private readonly _callees = new Map<string, Set<string>>();

  /** Fold one trace into the graph. O(S) — children indexed once. */
  addTrace(spans: ReadonlyArray<SpanSnapshot>): void {
    const byId = new Map<string, SpanSnapshot>();
    const kids = new Map<string, SpanSnapshot[]>();
    for (const s of spans) {
      byId.set(s.spanId, s);
      if (s.parentSpanId) {
        const list = kids.get(s.parentSpanId) ?? [];
        list.push(s);
        kids.set(s.parentSpanId, list);
      }
    }

    for (const s of spans) {
      const svc = serviceOf(s);
      this._spanCount.set(svc, (this._spanCount.get(svc) ?? 0) + 1);
      this._selfTime.set(svc, (this._selfTime.get(svc) ?? 0) + selfTime(s, kids.get(s.spanId) ?? []));

      const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
      if (!parent) continue;
      const callerSvc = serviceOf(parent);
      if (callerSvc === svc) continue;
      // Cross-service edge.
      const ekey = `${callerSvc}->${svc}`;
      let e = this._edges.get(ekey);
      if (!e) {
        e = {
          callerService: callerSvc,
          calleeService: svc,
          calls: 0,
          totalLatencyMs: 0,
          errors: 0,
        };
        this._edges.set(ekey, e);
      }
      e.calls += 1;
      e.totalLatencyMs += duration(s);
      if (s.status.code === 'ERROR') e.errors += 1;

      if (!this._callers.has(svc)) this._callers.set(svc, new Set());
      if (!this._callees.has(callerSvc)) this._callees.set(callerSvc, new Set());
      this._callers.get(svc)?.add(callerSvc);
      this._callees.get(callerSvc)?.add(svc);
    }
  }

  report(): LinkReport {
    const services = new Set<string>([
      ...this._spanCount.keys(),
      ...this._callers.keys(),
      ...this._callees.keys(),
    ]);
    const nodes: ServiceNode[] = [...services].map((svc) => ({
      service: svc,
      fanIn: this._callers.get(svc)?.size ?? 0,
      fanOut: this._callees.get(svc)?.size ?? 0,
      spanCount: this._spanCount.get(svc) ?? 0,
      selfTimeMs: this._selfTime.get(svc) ?? 0,
    }));
    nodes.sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));
    const edges: ServiceEdge[] = [...this._edges.values()];
    edges.sort((a, b) => b.calls - a.calls);
    return { nodes, edges };
  }
}

/** Exclusive (self) time: span duration minus covered child durations. */
function selfTime(span: SpanSnapshot, kids: ReadonlyArray<SpanSnapshot>): number {
  if (kids.length === 0) return duration(span);
  // Merge child intervals, clamped to the parent window.
  const intervals = kids
    .map((c) => ({
      s: Math.max(c.startTimeMs, span.startTimeMs),
      e: Math.min(c.endTimeMs, span.endTimeMs),
    }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
  let covered = 0;
  let curS = -Infinity;
  let curE = -Infinity;
  for (const i of intervals) {
    if (i.s > curE) {
      if (curE > curS) covered += curE - curS; // skip the -Infinity seed
      curS = i.s;
      curE = i.e;
    } else {
      curE = Math.max(curE, i.e);
    }
  }
  if (curE > curS) covered += curE - curS;
  return Math.max(duration(span) - covered, 0);
}

// ---------------------------------------------------------------------------
// Critical path — greedy longest-duration chain.
// ---------------------------------------------------------------------------

/**
 * Computes the critical path through a trace.
 *
 * The path starts at the root and at each level picks the child that
 * *ends latest* while overlapping the parent's active window — the
 * span that "holds the tail" of the trace. This is the O(V+E) greedy
 * approximation of the longest-path problem (which is NP-hard in
 * general DAGs but tractable because span trees are, well, trees).
 */
export function criticalPath(traceId: string, spans: ReadonlyArray<SpanSnapshot>): CriticalPath {
  const tree = new SpanTree(spans);
  const wall = traceWallClock(spans);
  const traceStart = Math.min(...spans.map((s) => s.startTimeMs));
  const steps: CriticalPathStep[] = [];

  const walk = (node: SpanSnapshot, cursorMs: number): void => {
    const wait = Math.max(node.startTimeMs - cursorMs, 0);
    steps.push({
      spanId: node.spanId,
      name: node.name,
      service: serviceOf(node),
      startMs: node.startTimeMs,
      durationMs: duration(node),
      waitMs: wait,
    });
    const kids = tree.childrenOf(node.spanId);
    if (kids.length === 0) return;
    // The child that ends latest is on the critical path.
    let best: SpanSnapshot | undefined;
    for (const k of kids) {
      if (!best || k.endTimeMs > best.endTimeMs) best = k;
    }
    if (best) walk(best, Math.max(cursorMs, node.startTimeMs));
  };

  const root = tree.roots.reduce<SpanSnapshot | undefined>(
    (a, r) => (a === undefined || r.endTimeMs > a.endTimeMs ? r : a),
    undefined,
  );
  if (root) walk(root, traceStart);

  const workMs = steps.reduce((s, x) => s + x.durationMs, 0);
  return {
    traceId,
    steps,
    workMs,
    wallClockMs: wall,
    coverage: wall === 0 ? 0 : workMs / wall,
  };
}

// ---------------------------------------------------------------------------
// Trace search
// ---------------------------------------------------------------------------

/** Summarize a trace for indexing/listing. */
export function summarize(traceId: string, spans: ReadonlyArray<SpanSnapshot>): TraceSummary {
  const services = new Set<string>();
  let hasError = false;
  let rootName = '(no root)';
  for (const s of spans) {
    services.add(serviceOf(s));
    if (s.status.code === 'ERROR') hasError = true;
    if (!s.parentSpanId) rootName = s.name;
  }
  return {
    traceId,
    rootName,
    services: [...services].sort(),
    spanCount: spans.length,
    durationMs: traceWallClock(spans),
    hasError,
    startedMs: Math.min(...spans.map((s) => s.startTimeMs)),
  };
}

/** Does a trace satisfy every clause of `q`? All clauses AND. */
export function matchesQuery(traceId: string, spans: ReadonlyArray<SpanSnapshot>, q: TraceQuery): boolean {
  const summary = summarize(traceId, spans);
  if (q.service && !summary.services.includes(q.service)) return false;
  if (q.operation && !spans.some((s) => s.name === q.operation)) return false;
  if (q.minDurationMs !== undefined && summary.durationMs < q.minDurationMs) return false;
  if (q.maxDurationMs !== undefined && summary.durationMs > q.maxDurationMs) return false;
  if (q.status === 'ERROR' && !summary.hasError) return false;
  if (q.status && q.status !== 'ERROR' && !spans.every((s) => s.status.code === q.status)) return false;
  if (q.attributes) {
    for (const [k, v] of Object.entries(q.attributes)) {
      if (!spans.some((s) => s.attributes[k] === v)) return false;
    }
  }
  return true;
}

/**
 * In-memory trace store with predicate search. Indexed by traceId;
 * search is a linear scan with the query's clauses short-circuiting —
 * fine for a dev-sized corpus (the real product would maintain inverted
 * indexes per attribute).
 */
export class TraceStore {
  private readonly _traces = new Map<string, SpanSnapshot[]>();

  put(spans: ReadonlyArray<SpanSnapshot>): void {
    for (const s of spans) {
      const list = this._traces.get(s.traceId) ?? [];
      list.push(s);
      this._traces.set(s.traceId, list);
    }
  }

  get(traceId: string): ReadonlyArray<SpanSnapshot> | undefined {
    return this._traces.get(traceId);
  }

  search(q: TraceQuery): TraceSummary[] {
    const out: TraceSummary[] = [];
    for (const [tid, spans] of this._traces) {
      if (matchesQuery(tid, spans, q)) out.push(summarize(tid, spans));
      if (q.limit !== undefined && out.length >= q.limit) break;
    }
    // Most recent first — the order an investigator wants.
    out.sort((a, b) => b.startedMs - a.startedMs);
    return out;
  }

  size(): number {
    return this._traces.size;
  }
}

/** Wall-clock duration = max(end) - min(start) across the trace. */
export function traceWallClock(spans: ReadonlyArray<SpanSnapshot>): number {
  if (spans.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of spans) {
    if (s.startTimeMs < min) min = s.startTimeMs;
    if (s.endTimeMs > max) max = s.endTimeMs;
  }
  return max - min;
}
