/**
 * Observability engine tests — router, buffer drop policies, correlation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  InMemorySignalSink,
  ManualClock,
  SignalBuffer,
  SignalRouter,
  TelemetrySignal,
} from '../../engine';

function logSignal(severity: string, body = 'msg', attrs: Record<string, string> = {}): TelemetrySignal {
  return { kind: 'log', timestampMs: 0, attributes: { severity, body, ...attrs } };
}

describe('SignalRouter', () => {
  let router: SignalRouter;
  let all: InMemorySignalSink;
  let errors: InMemorySignalSink;

  beforeEach(() => {
    all = new InMemorySignalSink('all');
    errors = new InMemorySignalSink('errors', ['log']);
    router = new SignalRouter(
      {
        bufferCapacity: 100,
        dropPolicy: 'drop-oldest',
        defaultSinks: ['all'],
        rules: [
          { name: 'errors-to-errors-sink', kinds: ['log'], minSeverity: 'error', sinks: ['errors'] },
          { name: 'svc-route', where: { service: 'payments' }, sinks: ['errors'] },
        ],
      },
      new ManualClock(0)
    );
    router.addSink(all);
    router.addSink(errors);
  });

  it('routes signals to the default sink', () => {
    router.ingest(logSignal('info'));
    expect(all.signals.length).toBe(1);
  });

  it('routes error logs to the error sink too', () => {
    router.ingest(logSignal('error'));
    expect(all.signals.length).toBe(1);
    expect(errors.signals.length).toBe(1);
  });

  it('matches attribute-based rules', () => {
    router.ingest(logSignal('info', 'x', { service: 'payments' }));
    expect(errors.signals.length).toBe(1);
  });

  it('does not match unrelated attributes', () => {
    router.ingest(logSignal('info', 'x', { service: 'other' }));
    expect(errors.signals.length).toBe(0);
  });

  it('respects sink kind filter', () => {
    router.ingest({ kind: 'metric', timestampMs: 0, attributes: {} });
    expect(errors.signals.length).toBe(0);
    expect(all.signals.length).toBe(1);
  });

  it('stamps ambient correlation ids', () => {
    router.setCorrelation('trace-1', 'span-1');
    router.ingest(logSignal('info'));
    expect(all.signals[0].traceId).toBe('trace-1');
    expect(all.signals[0].spanId).toBe('span-1');
  });

  it('tracks stats', () => {
    router.ingest(logSignal('info'));
    router.ingest(logSignal('error'));
    const s = router.getStats();
    expect(s.ingested).toBe(2);
    expect(s.routed).toBe(3); // info→all, error→all+errors
    expect(s.perSinkWrites['errors']).toBe(1);
  });
});

describe('SignalBuffer drop policies', () => {
  it('drop-oldest evicts the first inserted item', () => {
    const buf = new SignalBuffer(3, 'drop-oldest');
    buf.push(logSignal('info', 'a'));
    buf.push(logSignal('info', 'b'));
    buf.push(logSignal('info', 'c'));
    const evicted = buf.push(logSignal('info', 'd'));
    expect(evicted).not.toBe(false);
    expect((evicted as TelemetrySignal).attributes['body']).toBe('a');
    expect(buf.size).toBe(3);
    const items = buf.drain();
    expect(items.map((s) => s.attributes['body'])).toEqual(['b', 'c', 'd']);
  });

  it('drop-newest refuses the incoming signal', () => {
    const buf = new SignalBuffer(2, 'drop-newest');
    buf.push(logSignal('info', 'a'));
    buf.push(logSignal('info', 'b'));
    expect(buf.push(logSignal('info', 'c'))).toBe(false);
    expect(buf.size).toBe(2);
  });

  it('reject refuses the incoming signal and keeps the buffer', () => {
    const buf = new SignalBuffer(2, 'reject');
    buf.push(logSignal('info', 'a'));
    buf.push(logSignal('info', 'b'));
    expect(buf.push(logSignal('fatal', 'c'))).toBe(false);
    expect(buf.drain().map((s) => s.attributes['body'])).toEqual(['a', 'b']);
  });

  it('drop-lowest-severity evicts the least severe buffered entry', () => {
    const buf = new SignalBuffer(3, 'drop-lowest-severity');
    buf.push(logSignal('error', 'e'));
    buf.push(logSignal('info', 'i'));
    buf.push(logSignal('warn', 'w'));
    const evicted = buf.push(logSignal('fatal', 'f'));
    expect((evicted as TelemetrySignal).attributes['body']).toBe('i');
    const remaining = buf.drain().map((s) => s.attributes['body']);
    expect(remaining.sort()).toEqual(['e', 'f', 'w']);
  });

  it('drop-lowest-severity refuses an incoming low-severity signal', () => {
    const buf = new SignalBuffer(2, 'drop-lowest-severity');
    buf.push(logSignal('error', 'e'));
    buf.push(logSignal('fatal', 'f'));
    expect(buf.push(logSignal('trace', 't'))).toBe(false);
  });
});
