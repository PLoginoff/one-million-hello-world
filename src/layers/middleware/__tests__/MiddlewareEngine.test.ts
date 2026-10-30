/**
 * Middleware Engine Tests
 *
 * Covers: composition order, short-circuiting, predicates (path/method/
 * header), per-middleware timeouts, continueOnError, execution reports,
 * correlation context propagation (W3C traceparent), OTLP span export,
 * and per-middleware histogram metrics.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  MiddlewareEngine,
  MiddlewareEngineBuilder,
  MiddlewareTimeoutError,
  ManualClock,
  pathMatches,
  methodIn,
  headerEquals,
  and,
  or,
  not,
  CorrelationContextPropagator,
  DeterministicRandomSource,
  parseTraceParent,
  formatTraceParent,
  isValidTraceId,
  isValidSpanId,
  OtelSpanExporter,
  toOtelSpan,
  toOtelStatus,
  millisToUnixNano,
  DurationHistogram,
  MiddlewareMetricsCollector,
} from '../engine';
import {
  OtelExportRequest,
  OtelSpanKind,
  OtelStatusCode,
  PipelineRequest,
  PipelineResponse,
  SpanExportSink,
} from '../engine/types';
import { SpanStatus, TraceSpan } from '../types/middleware-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides?: Partial<PipelineRequest>): PipelineRequest {
  return {
    id: 'req-1',
    method: 'GET',
    path: '/api/users/42',
    headers: {},
    state: {},
    ...overrides,
  };
}

function okResponse(body: unknown = 'hello'): PipelineResponse {
  return { status: 200, headers: { 'content-type': 'text/plain' }, body };
}

const terminal = async () => okResponse();

class InMemorySink implements SpanExportSink {
  payloads: OtelExportRequest[] = [];
  failNext = false;

  async export(payload: OtelExportRequest): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('sink unavailable');
    }
    this.payloads.push(payload);
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe('MiddlewareEngine composition', () => {
  it('executes middleware in registration order (outer-in, inner-out)', async () => {
    const order: string[] = [];
    const engine = new MiddlewareEngine([
      {
        name: 'first',
        fn: async (req, next) => {
          order.push('first-before');
          const res = await next();
          order.push('first-after');
          return res;
        },
      },
      {
        name: 'second',
        fn: async (req, next) => {
          order.push('second-before');
          const res = await next();
          order.push('second-after');
          return res;
        },
      },
    ]);

    await engine.dispatch(makeRequest(), terminal);
    expect(order).toEqual(['first-before', 'second-before', 'second-after', 'first-after']);
  });

  it('short-circuits when middleware does not call next()', async () => {
    let handlerCalled = false;
    const engine = new MiddlewareEngine([
      {
        name: 'auth',
        fn: async () => ({ status: 401, headers: {}, body: 'unauthorized' }),
      },
    ]);

    const report = await engine.dispatch(makeRequest(), async () => {
      handlerCalled = true;
      return okResponse();
    });

    expect(handlerCalled).toBe(false);
    expect(report.response.status).toBe(401);
    expect(report.invocations[0].calledNext).toBe(false);
  });

  it('supports middleware transforming the response', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'wrapper',
        fn: async (req, next) => {
          const res = await next();
          return { ...res, headers: { ...res.headers, 'x-wrapped': '1' } };
        },
      },
    ]);

    const report = await engine.dispatch(makeRequest(), terminal);
    expect(report.response.headers['x-wrapped']).toBe('1');
  });

  it('propagates middleware errors by default', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'boom',
        fn: async () => {
          throw new Error('kaboom');
        },
      },
    ]);

    await expect(engine.dispatch(makeRequest(), terminal)).rejects.toThrow('kaboom');
  });

  it('continues the chain on error when continueOnError is set', async () => {
    const swallowed: unknown[] = [];
    const engine = new MiddlewareEngine(
      [
        {
          name: 'flaky-logger',
          fn: async () => {
            throw new Error('log sink down');
          },
          continueOnError: true,
        },
        {
          name: 'business',
          fn: async (req, next) => next(),
        },
      ],
      { hooks: { onSwallowedError: (_n, e) => swallowed.push(e) } }
    );

    const report = await engine.dispatch(makeRequest(), terminal);
    expect(report.response.status).toBe(200);
    expect(swallowed).toHaveLength(1);
    expect(report.invocations[0].failed).toBe(true);
    expect(report.invocations[1].executed).toBe(true);
  });

  it('produces a report with per-stage durations', async () => {
    const clock = new ManualClock(1000);
    const engine = new MiddlewareEngine(
      [
        {
          name: 'timed',
          fn: async (req, next) => {
            clock.advance(15);
            return next();
          },
        },
      ],
      { clock }
    );

    const report = await engine.dispatch(makeRequest(), terminal);
    expect(report.invocations[0].durationMs).toBe(15);
    expect(report.invocations[0].executed).toBe(true);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

describe('middleware predicates', () => {
  it('pathMatches exact string', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'only-users',
        predicates: [pathMatches('/users')],
        fn: async () => okResponse('users'),
      },
    ]);

    const hit = await engine.dispatch(makeRequest({ path: '/users' }), terminal);
    expect(hit.response.body).toBe('users');

    const miss = await engine.dispatch(makeRequest({ path: '/posts' }), terminal);
    expect(miss.invocations[0].executed).toBe(false);
    expect(miss.response.body).toBe('hello');
  });

  it('pathMatches prefix with trailing *', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'api-only',
        predicates: [pathMatches('/api/*')],
        fn: async () => okResponse('api'),
      },
    ]);

    const hit = await engine.dispatch(makeRequest({ path: '/api/v1/items' }), terminal);
    expect(hit.response.body).toBe('api');

    const miss = await engine.dispatch(makeRequest({ path: '/web' }), terminal);
    expect(miss.response.body).toBe('hello');
  });

  it('methodIn filters by HTTP method', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'mutation-guard',
        predicates: [methodIn('POST', 'PUT')],
        fn: async () => okResponse('guarded'),
      },
    ]);

    const post = await engine.dispatch(makeRequest({ method: 'POST' }), terminal);
    expect(post.response.body).toBe('guarded');

    const get = await engine.dispatch(makeRequest({ method: 'GET' }), terminal);
    expect(get.invocations[0].executed).toBe(false);
  });

  it('headerEquals matches header values', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'beta',
        predicates: [headerEquals('x-beta', 'yes')],
        fn: async () => okResponse('beta'),
      },
    ]);

    const req = makeRequest({ headers: { 'x-beta': 'yes' } });
    const report = await engine.dispatch(req, terminal);
    expect(report.response.body).toBe('beta');
  });

  it('combinators compose predicates', async () => {
    const pred = and(pathMatches('/api/*'), or(methodIn('GET'), methodIn('POST')), not(headerEquals('x-skip', '1')));

    const engine = new MiddlewareEngine([
      { name: 'combo', predicates: [pred], fn: async () => okResponse('hit') },
    ]);

    const hit = await engine.dispatch(makeRequest({ method: 'GET', path: '/api/x' }), terminal);
    expect(hit.response.body).toBe('hit');

    const skipped = await engine.dispatch(
      makeRequest({ method: 'GET', path: '/api/x', headers: { 'x-skip': '1' } }),
      terminal
    );
    expect(skipped.invocations[0].executed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

describe('middleware timeouts', () => {
  it('times out a middleware exceeding its budget', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'slow',
        timeoutMs: 10,
        fn: async () => new Promise<PipelineResponse>(() => {
          // never resolves
        }),
      },
    ]);

    await expect(engine.dispatch(makeRequest(), terminal)).rejects.toThrow(MiddlewareTimeoutError);
  });

  it('passes through fast middleware under timeout', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'fast',
        timeoutMs: 1000,
        fn: async (req, next) => next(),
      },
    ]);

    const report = await engine.dispatch(makeRequest(), terminal);
    expect(report.response.status).toBe(200);
    expect(report.invocations[0].timedOut).toBe(false);
  });

  it('marks timed-out invocations when continueOnError swallows', async () => {
    const engine = new MiddlewareEngine([
      {
        name: 'slow',
        timeoutMs: 5,
        continueOnError: true,
        fn: async () => new Promise<PipelineResponse>(() => {}),
      },
    ]);

    const report = await engine.dispatch(makeRequest(), terminal);
    expect(report.invocations[0].timedOut).toBe(true);
    expect(report.invocations[0].failed).toBe(true);
    expect(report.response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

describe('MiddlewareEngineBuilder', () => {
  it('builds an engine with fluent use() calls', async () => {
    const engine = MiddlewareEngineBuilder.create()
      .use('a', async (req, next) => next())
      .use('b', async () => okResponse('from-b'), { predicates: [pathMatches('/api/*')] })
      .build();

    expect(engine.names()).toEqual(['a', 'b']);

    const report = await engine.dispatch(makeRequest({ path: '/api/x' }), terminal);
    expect(report.response.body).toBe('from-b');
  });
});

// ---------------------------------------------------------------------------
// Correlation propagator
// ---------------------------------------------------------------------------

describe('CorrelationContextPropagator', () => {
  let propagator: CorrelationContextPropagator;

  beforeEach(() => {
    propagator = new CorrelationContextPropagator(new DeterministicRandomSource(42));
  });

  it('creates a root context with valid trace/span ids', () => {
    const ctx = propagator.createRoot();
    expect(isValidTraceId(ctx.traceId)).toBe(true);
    expect(isValidSpanId(ctx.spanId)).toBe(true);
    expect(ctx.correlationId.length).toBeGreaterThan(0);
  });

  it('extracts traceparent and preserves the inbound trace id', () => {
    const ctx = propagator.createRoot({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'x-correlation-id': 'corr-abc',
    });
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ctx.parentSpanId).toBe('00f067aa0ba902b7');
    expect(ctx.correlationId).toBe('corr-abc');
  });

  it('rejects malformed traceparent headers', () => {
    expect(parseTraceParent('garbage')).toBeNull();
    expect(parseTraceParent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBeNull();
    expect(parseTraceParent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull();
  });

  it('round-trips traceparent formatting', () => {
    const value = formatTraceParent('4bf92f3577b34da6a3ce929d0e0e4736', '00f067aa0ba902b7', true);
    const parsed = parseTraceParent(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(parsed!.parentId).toBe('00f067aa0ba902b7');
    expect(parsed!.flags).toBe(1);
  });

  it('runWithContext exposes the active context across awaits', async () => {
    const ctx = propagator.createRoot();
    expect(propagator.current).toBeUndefined();

    const seen = await propagator.runWithContext(ctx, async () => {
      const before = propagator.current;
      await Promise.resolve();
      const after = propagator.current;
      return { before, after };
    });

    expect(seen.before?.correlationId).toBe(ctx.correlationId);
    expect(seen.after?.correlationId).toBe(ctx.correlationId);
    expect(propagator.current).toBeUndefined();
  });

  it('pops the context when the callback throws', async () => {
    const ctx = propagator.createRoot();
    await expect(
      propagator.runWithContext(ctx, async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    expect(propagator.current).toBeUndefined();
    expect(propagator.depth).toBe(0);
  });

  it('createChild keeps trace/correlation ids and re-parents', async () => {
    const root = propagator.createRoot();
    const child = await propagator.runWithContext(root, async () => propagator.createChild());
    expect(child.traceId).toBe(root.traceId);
    expect(child.correlationId).toBe(root.correlationId);
    expect(child.parentSpanId).toBe(root.spanId);
    expect(child.spanId).not.toBe(root.spanId);
  });

  it('inject produces traceparent + correlation headers', () => {
    const ctx = propagator.createRoot({ 'x-request-id': 'r-1', 'x-correlation-id': 'c-1' });
    const headers = propagator.inject(ctx);
    expect(headers['x-correlation-id']).toBe('c-1');
    expect(headers['x-request-id']).toBe('r-1');
    expect(headers.traceparent.startsWith('00-')).toBe(true);
  });

  it('isSampled reads the flags bit', () => {
    expect(
      propagator.isSampled({
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      })
    ).toBe(false);
    expect(
      propagator.isSampled({
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OTLP exporter
// ---------------------------------------------------------------------------

describe('OtelSpanExporter', () => {
  function makeSpan(overrides?: Partial<TraceSpan>): TraceSpan {
    return {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      parentSpanId: '1111111111111111',
      operationName: 'GET /api/users',
      startTime: new Date(1_700_000_000_000),
      endTime: new Date(1_700_000_000_123),
      status: SpanStatus.OK,
      tags: { 'http.method': 'GET', 'http.status_code': 200 },
      ...overrides,
    };
  }

  it('converts a span to OTLP JSON shape', () => {
    const span = toOtelSpan(makeSpan(), OtelSpanKind.SERVER);
    expect(span.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(span.parentSpanId).toBe('1111111111111111');
    expect(span.kind).toBe(OtelSpanKind.SERVER);
    expect(span.status.code).toBe(OtelStatusCode.OK);
    expect(span.startTimeUnixNano).toBe(millisToUnixNano(1_700_000_000_000));
    expect(span.endTimeUnixNano).toBe(millisToUnixNano(1_700_000_000_123));
    const method = span.attributes.find((a) => a.key === 'http.method');
    expect(method?.value.stringValue).toBe('GET');
    const statusAttr = span.attributes.find((a) => a.key === 'http.status_code');
    expect(statusAttr?.value.intValue).toBe(200);
  });

  it('maps statuses to OTLP codes', () => {
    expect(toOtelStatus(SpanStatus.OK)).toBe(OtelStatusCode.OK);
    expect(toOtelStatus(SpanStatus.ERROR)).toBe(OtelStatusCode.ERROR);
    expect(toOtelStatus(SpanStatus.TIMEOUT)).toBe(OtelStatusCode.ERROR);
    expect(toOtelStatus(undefined)).toBe(OtelStatusCode.UNSET);
  });

  it('includes exception attributes for error spans', () => {
    const span = toOtelSpan(
      makeSpan({
        status: SpanStatus.ERROR,
        error: { type: 'TypeError', message: 'undefined property' },
      })
    );
    const typeAttr = span.attributes.find((a) => a.key === 'exception.type');
    expect(typeAttr?.value.stringValue).toBe('TypeError');
    expect(span.status.code).toBe(OtelStatusCode.ERROR);
  });

  it('auto-flushes when the batch size is reached', async () => {
    const sink = new InMemorySink();
    const exporter = new OtelSpanExporter(sink, { maxBatchSize: 3, serviceName: 'test-svc' });

    await exporter.record(toOtelSpan(makeSpan()));
    await exporter.record(toOtelSpan(makeSpan()));
    expect(sink.payloads).toHaveLength(0);
    await exporter.record(toOtelSpan(makeSpan()));
    expect(sink.payloads).toHaveLength(1);
    expect(sink.payloads[0].resourceSpans[0].scopeSpans[0].spans).toHaveLength(3);
    expect(exporter.exportedCount).toBe(3);
  });

  it('flush drains the queue into a resourceSpans payload', async () => {
    const sink = new InMemorySink();
    const exporter = new OtelSpanExporter(sink, { serviceName: 'svc', serviceVersion: '9.9' });

    await exporter.recordTraceSpan(makeSpan());
    await exporter.recordTraceSpan(makeSpan());
    const flushed = await exporter.flush();

    expect(flushed).toBe(2);
    expect(exporter.pendingCount).toBe(0);

    const payload = sink.payloads[0];
    const resource = payload.resourceSpans[0].resource;
    const svcName = resource.attributes.find((a) => a.key === 'service.name');
    const svcVersion = resource.attributes.find((a) => a.key === 'service.version');
    expect(svcName?.value.stringValue).toBe('svc');
    expect(svcVersion?.value.stringValue).toBe('9.9');
  });

  it('re-queues the batch when the sink fails', async () => {
    const sink = new InMemorySink();
    sink.failNext = true;
    const exporter = new OtelSpanExporter(sink, { maxBatchSize: 1 });

    await exporter.record(toOtelSpan(makeSpan()));
    expect(exporter.exportFailures).toBe(1);
    expect(exporter.pendingCount).toBe(1);

    await exporter.flush();
    expect(exporter.exportedCount).toBe(1);
    expect(sink.payloads).toHaveLength(1);
  });

  it('drops oldest spans when the queue overflows', async () => {
    const sink = new InMemorySink();
    const exporter = new OtelSpanExporter(sink, { maxQueueSize: 2, maxBatchSize: 100 });

    await exporter.record(toOtelSpan(makeSpan({ spanId: 'aaaaaaaaaaaaaaaa' })));
    await exporter.record(toOtelSpan(makeSpan({ spanId: 'bbbbbbbbbbbbbbbb' })));
    await exporter.record(toOtelSpan(makeSpan({ spanId: 'cccccccccccccccc' })));

    expect(exporter.droppedCount).toBe(1);
    expect(exporter.pendingCount).toBe(2);

    await exporter.flush();
    const spanIds = sink.payloads[0].resourceSpans[0].scopeSpans[0].spans.map((s) => s.spanId);
    expect(spanIds).toEqual(['bbbbbbbbbbbbbbbb', 'cccccccccccccccc']);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('DurationHistogram', () => {
  it('observes values into cumulative buckets', () => {
    const hist = new DurationHistogram([10, 50, 100]);
    hist.observe(5);   // bucket 10
    hist.observe(20);  // bucket 50
    hist.observe(60);  // bucket 100
    hist.observe(500); // overflow

    const snap = hist.snapshot();
    expect(snap.counts).toEqual([1, 2, 3]);
    expect(snap.overflow).toBe(1);
    expect(snap.count).toBe(4);
    expect(snap.sum).toBe(585);
    expect(snap.min).toBe(5);
    expect(snap.max).toBe(500);
  });

  it('clamps negative observations to zero', () => {
    const hist = new DurationHistogram([10]);
    hist.observe(-5);
    expect(hist.snapshot().min).toBe(0);
  });

  it('rejects unsorted boundaries', () => {
    expect(() => new DurationHistogram([50, 10])).toThrow();
    expect(() => new DurationHistogram([])).toThrow();
  });

  it('estimates percentiles by interpolation', () => {
    const hist = new DurationHistogram([10, 100]);
    for (let i = 0; i < 10; i++) {
      hist.observe(10); // all in first bucket
    }
    expect(hist.percentile(50)).toBeGreaterThan(0);
    expect(hist.percentile(100)).toBe(10);
  });
});

describe('MiddlewareMetricsCollector', () => {
  it('aggregates invocation records per middleware', async () => {
    const metrics = new MiddlewareMetricsCollector([10, 100, 1000]);
    const clock = new ManualClock();

    const engine = new MiddlewareEngine(
      [
        {
          name: 'auth',
          predicates: [pathMatches('/api/*')],
          fn: async (req, next) => {
            clock.advance(30);
            return next();
          },
        },
        {
          name: 'cache',
          fn: async () => okResponse('cached'),
        },
      ],
      { clock, metrics }
    );

    await engine.dispatch(makeRequest({ path: '/api/x' }), terminal);
    await engine.dispatch(makeRequest({ path: '/web' }), terminal);

    const auth = metrics.snapshotFor('auth');
    expect(auth).toBeDefined();
    expect(auth!.invocations).toBe(1);
    expect(auth!.skips).toBe(1);
    expect(auth!.duration.count).toBe(1);
    expect(auth!.duration.sum).toBe(30);

    const cache = metrics.snapshotFor('cache');
    expect(cache!.shortCircuits).toBe(2);

    const all = metrics.snapshot();
    expect(all.map((m) => m.name)).toEqual(['auth', 'cache']);
  });

  it('counts failures and timeouts', async () => {
    const metrics = new MiddlewareMetricsCollector();
    const engine = new MiddlewareEngine(
      [
        { name: 'fail', continueOnError: true, fn: async () => { throw new Error('x'); } },
        {
          name: 'slow',
          timeoutMs: 5,
          continueOnError: true,
          fn: async () => new Promise<PipelineResponse>(() => {}),
        },
      ],
      { metrics }
    );

    await engine.dispatch(makeRequest(), terminal);
    expect(metrics.snapshotFor('fail')!.failures).toBe(1);
    expect(metrics.snapshotFor('slow')!.timeouts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: correlation + engine
// ---------------------------------------------------------------------------

describe('engine + propagator integration', () => {
  it('middleware sees the pushed correlation context', async () => {
    const propagator = new CorrelationContextPropagator(new DeterministicRandomSource(7));
    let captured: string | undefined;

    const engine = new MiddlewareEngine(
      [
        {
          name: 'capture',
          fn: async (req, next) => {
            captured = propagator.current?.correlationId;
            return next();
          },
        },
      ],
      { propagator }
    );

    const ctx = propagator.createRoot({ 'x-correlation-id': 'corr-xyz' });
    await propagator.runWithContext(ctx, async () => {
      await engine.dispatch(makeRequest(), terminal);
    });

    expect(captured).toBe('corr-xyz');
  });
});
