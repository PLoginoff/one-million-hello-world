/**
 * Redaction pipeline tests — PII scrubbing, key rules, stats.
 */

import { describe, it, expect } from 'bun:test';
import {
  BUILTIN_PATTERNS,
  CorrelationContext,
  OtlpExportSink,
  RedactionPipeline,
  RegexMatcher,
  SensitiveKeyMatcher,
  formatBaggage,
  newSpanId,
  newTraceId,
  parseBaggage,
} from '../../engine';

describe('RedactionPipeline', () => {
  it('masks emails by default', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactText('contact alice@example.com for details');
    expect(out).not.toContain('alice@example.com');
    expect(out).toContain('[TOKEN:email:');
  });

  it('masks credit card numbers', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactText('card 4111 1111 1111 1111 charged');
    expect(out).toContain('[REDACTED:credit-card]');
  });

  it('masks SSNs', () => {
    const p = RedactionPipeline.defaults();
    expect(p.redactText('ssn 123-45-6789')).toContain('[REDACTED:ssn]');
  });

  it('removes bearer tokens entirely', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactText('Authorization: Bearer abc.def.ghi');
    expect(out).not.toContain('abc.def.ghi');
  });

  it('scrubs values whose key is sensitive regardless of content', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactAttributes({ password: 'hunter2', user: 'alice' });
    expect(out['password']).toContain('[REDACTED:sensitive-key]');
    expect(out['user']).toBe('alice');
  });

  it('matches composite sensitive keys like db_password', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactAttributes({ db_password: 's3cret' });
    expect(out['db_password']).toContain('[REDACTED');
  });

  it('redacts strings inside attribute arrays', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactAttributes({ recipients: ['a@x.com', 'b@y.com'] });
    const arr = out['recipients'] as string[];
    expect(arr[0]).not.toContain('a@x.com');
    expect(arr[1]).not.toContain('b@y.com');
  });

  it('leaves non-PII values untouched', () => {
    const p = RedactionPipeline.defaults();
    const out = p.redactAttributes({ region: 'us-east-1', count: 42 });
    expect(out['region']).toBe('us-east-1');
    expect(out['count']).toBe(42);
  });

  it('collects replacement statistics', () => {
    const p = RedactionPipeline.defaults();
    p.redactText('a@b.com');
    p.redactText('c@d.com');
    const stats = p.getStats();
    expect(stats.evaluations).toBe(2);
    expect(stats.totalReplacements).toBeGreaterThanOrEqual(2);
    expect(stats.perMatcherReplacements['email']).toBeGreaterThanOrEqual(2);
  });

  it('supports custom regex matchers', () => {
    const p = new RedactionPipeline([new RegexMatcher('order-id', /ORD-\d+/g, 'mask')]);
    expect(p.redactText('see ORD-12345')).toBe('see [REDACTED:order-id]');
  });

  it('sensitive key matcher can be used standalone', () => {
    const m = new SensitiveKeyMatcher(['api_key']);
    expect(m.apply('whatever', 'api_key').changed).toBe(true);
    expect(m.apply('whatever', 'other').changed).toBe(false);
  });
});

describe('CorrelationContext', () => {
  it('applies trace context to signals', () => {
    const ctx = new CorrelationContext();
    ctx.run(
      { traceId: 't1', spanId: 's1', baggage: {}, sampled: true },
      () => {
        const sig = { kind: 'log' as const, timestampMs: 0, attributes: {} };
        const out = ctx.apply(sig);
        expect(out.traceId).toBe('t1');
        expect(out.spanId).toBe('s1');
      }
    );
  });

  it('propagates baggage as namespaced attributes', () => {
    const ctx = new CorrelationContext();
    ctx.run(
      { traceId: 't', spanId: 's', baggage: { tenant: 'acme' }, sampled: true },
      () => {
        const sig = { kind: 'log' as const, timestampMs: 0, attributes: {} };
        const out = ctx.apply(sig);
        expect(out.attributes['baggage.tenant']).toBe('acme');
      }
    );
  });

  it('preserves explicit ids already on the signal', () => {
    const ctx = new CorrelationContext();
    ctx.run({ traceId: 't', spanId: 's', baggage: {}, sampled: true }, () => {
      const sig = { kind: 'log' as const, timestampMs: 0, traceId: 'explicit', attributes: {} };
      expect(ctx.apply(sig).traceId).toBe('explicit');
    });
  });

  it('nested contexts restore correctly', () => {
    const ctx = new CorrelationContext();
    ctx.run({ traceId: 'outer', spanId: 's', baggage: {}, sampled: true }, () => {
      ctx.run({ traceId: 'inner', spanId: 's', baggage: {}, sampled: true }, () => {
        expect(ctx.current()?.traceId).toBe('inner');
      });
      expect(ctx.current()?.traceId).toBe('outer');
    });
    expect(ctx.current()).toBeUndefined();
  });

  it('parses and formats baggage headers', () => {
    expect(parseBaggage('a=1, b=hello%20world')).toEqual({ a: '1', b: 'hello world' });
    expect(formatBaggage({ a: '1', b: 'x y' })).toBe('a=1, b=x%20y');
  });
});

describe('OtlpExportSink', () => {
  it('produces an OTLP-shaped document', () => {
    const sink = new OtlpExportSink({ attributes: { 'service.name': 'svc' } });
    sink.write([
      { kind: 'log', timestampMs: 1_000, traceId: 't', spanId: 's',
        attributes: { severity: 'warn', body: 'slow query' } },
      { kind: 'trace', timestampMs: 900, traceId: 't', spanId: 's',
        attributes: { name: 'GET /', statusCode: 'OK', endTimeMs: 1_100 } },
      { kind: 'metric', timestampMs: 950, attributes: {} },
    ]);
    const doc = sink.document();
    expect(doc.resource.attributes.some((a) => a.key === 'service.name')).toBe(true);
    expect(doc.resourceLogs[0].scopeLogs[0].logRecords.length).toBe(1);
    expect(doc.resourceSpans[0].scopeSpans[0].spans.length).toBe(1);
    expect(doc.resourceMetrics[0].scopeMetrics[0].metrics.length).toBe(1);
  });

  it('flush clears the buffer and invokes the callback', () => {
    let flushed = 0;
    const sink = new OtlpExportSink({ attributes: {} }, (doc) => {
      flushed++;
      expect(doc.resourceLogs.length).toBe(1);
    });
    sink.write([{ kind: 'log', timestampMs: 0, attributes: { body: 'x' } }]);
    sink.flush();
    expect(flushed).toBe(1);
    expect(sink.bufferedCount()).toBe(0);
  });
});

describe('id generators', () => {
  it('trace ids are 32 hex chars, span ids 16', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });
});
