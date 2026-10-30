/**
 * Trace Diff + Error Attribution — regression analysis over spans.
 *
 * `TraceDiff` compares two traces span-by-span (matched on a stable
 * operation signature, since span ids differ between runs) to answer
 * "what changed between baseline and candidate?" — the trace-level
 * equivalent of a code diff. Used by canary analysis and regression
 * hunting.
 *
 * `ErrorAttribution` walks the span tree to distinguish *originating*
 * errors (the service where the fault started) from *propagated* ones
 * (parents that merely recorded the child's failure). Root cause = the
 * deepest ERROR span whose ancestors' errors postdate or coincide
 * with it.
 *
 * @module DistributedTracingLayer/Engine2
 */

import { SpanSnapshot, SpanTree } from '../engine/Span';

const SERVICE_ATTR = 'service.name';

function svc(s: SpanSnapshot): string {
  const v = s.attributes[SERVICE_ATTR];
  return typeof v === 'string' ? v : 'unknown';
}

/**
 * A stable operation signature: (service, operation name, kind). Span
 * ids are ephemeral so matching happens on this instead — the standard
 * approach for comparing traces across runs.
 */
function opKey(s: SpanSnapshot): string {
  return `${svc(s)}|${s.name}|${s.kind}`;
}

// ---------------------------------------------------------------------------
// Trace diff
// ---------------------------------------------------------------------------

export interface SpanDelta {
  /** Matched signature, or the unmatched side's signature. */
  readonly opKey: string;
  readonly status: 'added' | 'removed' | 'slower' | 'faster' | 'status-changed' | 'unchanged';
  readonly baselineDurationMs?: number;
  readonly candidateDurationMs?: number;
  readonly deltaMs?: number;
  readonly baselineStatus?: string;
  readonly candidateStatus?: string;
}

export interface TraceDiffReport {
  readonly baselineTraceId: string;
  readonly candidateTraceId: string;
  readonly deltas: ReadonlyArray<SpanDelta>;
  readonly addedSpans: number;
  readonly removedSpans: number;
  readonly slowerSpans: number;
  /** Wall-clock regression: candidate − baseline duration (ms). */
  readonly wallClockDeltaMs: number;
}

export interface TraceDiffOptions {
  /** |Δduration| below this counts as unchanged. */
  readonly durationToleranceMs: number;
}

/**
 * Diff two traces. Spans are matched by `opKey`; duplicates of the
 * same operation are paired in start-time order.
 */
export function diffTraces(
  baselineTraceId: string,
  baseline: ReadonlyArray<SpanSnapshot>,
  candidateTraceId: string,
  candidate: ReadonlyArray<SpanSnapshot>,
  opts: TraceDiffOptions = { durationToleranceMs: 10 },
): TraceDiffReport {
  const bMap = groupByOp(baseline);
  const cMap = groupByOp(candidate);
  const deltas: SpanDelta[] = [];
  let added = 0;
  let removed = 0;
  let slower = 0;

  const keys = new Set<string>([...bMap.keys(), ...cMap.keys()]);
  for (const key of keys) {
    const bList = bMap.get(key) ?? [];
    const cList = cMap.get(key) ?? [];
    const n = Math.max(bList.length, cList.length);
    for (let i = 0; i < n; i++) {
      const b = bList[i];
      const c = cList[i];
      if (b && !c) {
        removed += 1;
        deltas.push({
          opKey: key,
          status: 'removed',
          baselineDurationMs: b.endTimeMs - b.startTimeMs,
          baselineStatus: b.status.code,
        });
        continue;
      }
      if (!b && c) {
        added += 1;
        deltas.push({
          opKey: key,
          status: 'added',
          candidateDurationMs: c.endTimeMs - c.startTimeMs,
          candidateStatus: c.status.code,
        });
        continue;
      }
      const bDur = b.endTimeMs - b.startTimeMs;
      const cDur = c.endTimeMs - c.startTimeMs;
      const delta = cDur - bDur;
      let status: SpanDelta['status'] = 'unchanged';
      if (b.status.code !== c.status.code) status = 'status-changed';
      else if (delta > opts.durationToleranceMs) {
        status = 'slower';
        slower += 1;
      } else if (delta < -opts.durationToleranceMs) {
        status = 'faster';
      }
      deltas.push({
        opKey: key,
        status,
        baselineDurationMs: bDur,
        candidateDurationMs: cDur,
        deltaMs: delta,
        baselineStatus: b.status.code,
        candidateStatus: c.status.code,
      });
    }
  }
  deltas.sort((a, b) => Math.abs(b.deltaMs ?? 0) - Math.abs(a.deltaMs ?? 0));

  return {
    baselineTraceId,
    candidateTraceId,
    deltas,
    addedSpans: added,
    removedSpans: removed,
    slowerSpans: slower,
    wallClockDeltaMs: wallClock(candidate) - wallClock(baseline),
  };
}

function groupByOp(spans: ReadonlyArray<SpanSnapshot>): Map<string, SpanSnapshot[]> {
  const m = new Map<string, SpanSnapshot[]>();
  for (const s of [...spans].sort((a, b) => a.startTimeMs - b.startTimeMs)) {
    const k = opKey(s);
    const list = m.get(k) ?? [];
    list.push(s);
    m.set(k, list);
  }
  return m;
}

function wallClock(spans: ReadonlyArray<SpanSnapshot>): number {
  if (spans.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of spans) {
    if (s.startTimeMs < min) min = s.startTimeMs;
    if (s.endTimeMs > max) max = s.endTimeMs;
  }
  return max - min;
}

// ---------------------------------------------------------------------------
// Error attribution
// ---------------------------------------------------------------------------

export interface ErrorAttribution {
  readonly traceId: string;
  /** The span where the fault originated (deepest-first ERROR). */
  readonly originSpanId?: string;
  readonly originService?: string;
  readonly originOperation?: string;
  /** Spans that merely propagated the error upward. */
  readonly propagatedSpanIds: ReadonlyArray<string>;
  /** All ERROR spans found, deepest-first. */
  readonly errorChain: ReadonlyArray<string>;
}

/**
 * Attribute the root cause of a trace failure.
 *
 * An ERROR span whose parent is also ERROR is propagation unless it
 * carries its own `exception` event — the convention instrumentation
 * follows (a genuine fault records the exception on the span that
 * caught it first). The origin is the deepest span with either an
 * `exception` event or no ERROR parent.
 */
export function attributeError(traceId: string, spans: ReadonlyArray<SpanSnapshot>): ErrorAttribution {
  const tree = new SpanTree(spans);
  const errored = spans.filter((s) => s.status.code === 'ERROR');
  if (errored.length === 0) {
    return { traceId, propagatedSpanIds: [], errorChain: [] };
  }
  const hasExceptionEvent = (s: SpanSnapshot): boolean =>
    s.events.some((e) => e.name === 'exception');

  // Deepest-first by path depth from a root.
  const depth = new Map<string, number>();
  const walk = (s: SpanSnapshot, d: number): void => {
    depth.set(s.spanId, d);
    for (const c of tree.childrenOf(s.spanId)) walk(c, d + 1);
  };
  for (const r of tree.roots) walk(r, 0);
  errored.sort((a, b) => (depth.get(b.spanId) ?? 0) - (depth.get(a.spanId) ?? 0));

  // Prefer a span with an explicit exception event; else deepest ERROR.
  const origin =
    errored.find((s) => hasExceptionEvent(s)) ??
    errored[0];

  const originId = origin.spanId;
  const propagated = errored
    .filter((s) => s.spanId !== originId)
    .map((s) => s.spanId);

  return {
    traceId,
    originSpanId: originId,
    originService: svc(origin),
    originOperation: origin.name,
    propagatedSpanIds: propagated,
    errorChain: errored.map((s) => s.spanId),
  };
}
