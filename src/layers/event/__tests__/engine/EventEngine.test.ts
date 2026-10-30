/**
 * Event Engine tests
 *
 * Covers: append-only log ordering + optimistic concurrency, envelope
 * correlation/causation, upcasting chains, projection checkpoints and
 * rebuild-after-re-registration, catch-up subscriptions.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  EventEngine,
  EventLog,
  UpcasterRegistry,
  EventConcurrencyError,
} from '../../engine';
import type { StoredEngineEvent } from '../../engine';

let clock: number;
let idSeq: number;

function freshEngine(): EventEngine {
  return new EventEngine({ clock: () => clock, idGen: () => `e${idSeq++}` });
}

beforeEach(() => {
  clock = 1_000;
  idSeq = 1;
});

// --------------------------------------------------------------------------

describe('EventLog', () => {
  it('assigns contiguous global + stream positions', () => {
    const log = new EventLog({ clock: () => clock });
    const a = log.append('s1', [{ streamId: 's1', type: 'A', data: 1 }]);
    const b = log.append('s2', [{ streamId: 's2', type: 'B', data: 2 }]);
    const c = log.append('s1', [{ streamId: 's1', type: 'C', data: 3 }]);
    expect(a[0].globalPosition).toBe(0);
    expect(b[0].globalPosition).toBe(1);
    expect(c[0].globalPosition).toBe(2);
    expect(c[0].streamPosition).toBe(1); // second event in stream s1
  });

  it('enforces expectedStreamPosition', () => {
    const log = new EventLog();
    log.append('s', [{ streamId: 's', type: 'T', data: null }], -1);
    expect(() =>
      log.append('s', [{ streamId: 's', type: 'T', data: null }], -1)
    ).toThrow(EventConcurrencyError);
    // Correct expectation succeeds.
    log.append('s', [{ streamId: 's', type: 'T', data: null }], 0);
    expect(log.streamTip('s')).toBe(1);
  });

  it('batch append is atomic across positions', () => {
    const log = new EventLog();
    const evts = log.append('s', [
      { streamId: 's', type: 'A', data: 1 },
      { streamId: 's', type: 'B', data: 2 },
      { streamId: 's', type: 'C', data: 3 },
    ]);
    expect(evts.map((e) => e.streamPosition)).toEqual([0, 1, 2]);
    expect(evts.map((e) => e.globalPosition)).toEqual([0, 1, 2]);
  });

  it('reads stream ranges and backwards tail', () => {
    const log = new EventLog();
    for (let i = 0; i < 5; i++) log.append('s', [{ streamId: 's', type: 'T', data: i }]);
    expect(log.readStream('s', 1, 3).map((e) => e.data)).toEqual([1, 2, 3]);
    expect(log.readStreamBackwards('s', 2).map((e) => e.data)).toEqual([4, 3]);
  });
});

// --------------------------------------------------------------------------

describe('EventEngine — envelopes', () => {
  it('threads correlation/causation through the chain', () => {
    const eng = freshEngine();
    const first = eng.emit('s', [{ streamId: 's', type: 'Started', data: {} }], -1, {
      correlationId: 'req-1',
    });
    // Second event inherits tracing fields from the first.
    const second = eng.emit(
      's',
      [{ streamId: 's', type: 'Continued', data: {} }],
      0,
      eng.inheritMeta(first[0])
    );
    expect(second[0].meta.correlationId).toBe('req-1');
    expect(second[0].meta.causationId).toBe(first[0].id);
  });
});

// --------------------------------------------------------------------------

describe('Upcasting', () => {
  it('migrates v1 events through a chain to latest', () => {
    const reg = new UpcasterRegistry();
    reg
      .register('UserCreated', 1, (d) => ({ ...(d as object), email: null }))
      .register('UserCreated', 2, (d) => {
        const x = d as { name: string; email: string | null };
        return { name: x.name, contact: { email: x.email } };
      });

    const eng = freshEngine();
    eng.upcasters.register('UserCreated', 1, (d) => ({ ...(d as object), email: null }));
    eng.upcasters.register('UserCreated', 2, (d) => {
      const x = d as { name: string; email: string | null };
      return { name: x.name, contact: { email: x.email } };
    });
    eng.emit('u', [{ streamId: 'u', type: 'UserCreated', data: { name: 'ann' }, schemaVersion: 1 }]);

    const read = eng.readStream('u')[0];
    expect(read.schemaVersion).toBe(3);
    expect(read.data).toEqual({ name: 'ann', contact: { email: null } });

    // The raw log keeps the original version (truth preservation).
    const raw = eng.log.readStream('u')[0];
    expect(raw.schemaVersion).toBe(1);
    expect(raw.data).toEqual({ name: 'ann' });

    void reg;
  });

  it('leaves events untouched when no chain exists', () => {
    const eng = freshEngine();
    eng.emit('s', [{ streamId: 's', type: 'Other', data: { x: 1 }, schemaVersion: 1 }]);
    expect(eng.readStream('s')[0].data).toEqual({ x: 1 });
  });
});

// --------------------------------------------------------------------------

describe('ProjectionEngine', () => {
  interface Counter {
    count: number;
    names: string[];
  }
  const counterDef = {
    name: 'counter',
    init: (): Counter => ({ count: 0, names: [] }),
    handlers: {
      Named: (s: Counter, e: StoredEngineEvent) => ({
        count: s.count + 1,
        names: [...s.names, (e.data as { n: string }).n],
      }),
    },
  };

  it('folds events into read-model state with checkpoint', () => {
    const eng = freshEngine();
    eng.emit('s', [
      { streamId: 's', type: 'Named', data: { n: 'a' } },
      { streamId: 's', type: 'Named', data: { n: 'b' } },
      { streamId: 's', type: 'Ignored', data: {} },
    ]);
    eng.registerProjection(counterDef);
    const st = eng.projectionState<Counter>('counter');
    expect(st.names).toEqual(['a', 'b']);
    const cp = eng.projectionCheckpoint('counter');
    expect(cp?.position).toBe(2); // skipped event still advances position
    expect(cp?.appliedCount).toBe(2);
  });

  it('catchUp only processes new events', () => {
    const eng = freshEngine();
    eng.registerProjection(counterDef);
    eng.emit('s', [{ streamId: 's', type: 'Named', data: { n: 'x' } }]);
    eng.catchUpProjections();
    expect(eng.projectionState<Counter>('counter').names).toEqual(['x']);
    const cp = eng.projectionCheckpoint('counter');
    expect(cp?.appliedCount).toBe(1);
  });

  it('rebuilds projection after handler re-registration', () => {
    const eng = freshEngine();
    eng.emit('s', [
      { streamId: 's', type: 'Named', data: { n: 'a' } },
      { streamId: 's', type: 'Named', data: { n: 'b' } },
    ]);
    eng.registerProjection(counterDef);
    expect(eng.projectionState<Counter>('counter').count).toBe(2);

    // Bug fix: count should track distinct names only.
    eng.rebuildProjection({
      ...counterDef,
      handlers: {
        Named: (s: Counter, e: StoredEngineEvent) => ({
          count: s.names.includes((e.data as { n: string }).n) ? s.count : s.count + 1,
          names: [...s.names, (e.data as { n: string }).n],
        }),
      },
    });
    expect(eng.projectionState<Counter>('counter').names).toEqual(['a', 'b']);
    expect(eng.projectionCheckpoint('counter')?.position).toBe(1);
  });

  it('respects streamFilter', () => {
    const eng = freshEngine();
    eng.emit('keep', [{ streamId: 'keep', type: 'Named', data: { n: 'k' } }]);
    eng.emit('drop', [{ streamId: 'drop', type: 'Named', data: { n: 'd' } }]);
    eng.registerProjection({ ...counterDef, streamFilter: (id) => id === 'keep' });
    expect(eng.projectionState<Counter>('counter').names).toEqual(['k']);
  });
});

// --------------------------------------------------------------------------

describe('CatchUpSubscription', () => {
  it('delivers historical events then live tail', () => {
    const eng = freshEngine();
    eng.emit('s', [{ streamId: 's', type: 'A', data: 1 }, { streamId: 's', type: 'B', data: 2 }]);

    const sub = eng.subscribe(0);
    const r1 = eng.subscriptions.poll(sub);
    expect(r1.events.map((e) => e.data)).toEqual([1, 2]);
    expect(r1.caughtUp).toBe(true);

    // Live tail: new commits arrive on next poll.
    eng.emit('s', [{ streamId: 's', type: 'C', data: 3 }]);
    const r2 = eng.subscriptions.poll(sub);
    expect(r2.events.map((e) => e.data)).toEqual([3]);
    expect(sub.position).toBe(3);
  });

  it('resumes from a saved position', () => {
    const eng = freshEngine();
    eng.emit('s', [
      { streamId: 's', type: 'A', data: 1 },
      { streamId: 's', type: 'B', data: 2 },
      { streamId: 's', type: 'C', data: 3 },
    ]);
    const sub = eng.subscribe(0);
    eng.subscriptions.poll(sub, 2);
    // "Crash" — new subscription resumes from saved position.
    const sub2 = eng.subscribe(sub.position);
    expect(eng.subscriptions.drain(sub2).map((e) => e.data)).toEqual([3]);
  });

  it('applies upcasters during delivery', () => {
    const eng = freshEngine();
    eng.emit('s', [{ streamId: 's', type: 'E', data: { v: 1 }, schemaVersion: 1 }]);
    eng.upcasters.register('E', 1, (d) => ({ ...(d as object), upgraded: true }));
    const sub = eng.subscribe(0);
    const r = eng.subscriptions.poll(sub);
    expect((r.events[0].data as Record<string, unknown>).upgraded).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe('replay', () => {
  it('replays all events in order through a handler', () => {
    const eng = freshEngine();
    eng.emit('a', [{ streamId: 'a', type: 'T', data: 1 }]);
    eng.emit('b', [{ streamId: 'b', type: 'T', data: 2 }]);
    eng.emit('a', [{ streamId: 'a', type: 'T', data: 3 }]);
    const seen: unknown[] = [];
    const n = eng.replay((e) => seen.push(e.data));
    expect(n).toBe(3);
    expect(seen).toEqual([1, 2, 3]); // global commit order
  });

  it('filters during replay', () => {
    const eng = freshEngine();
    eng.emit('a', [{ streamId: 'a', type: 'Keep', data: 1 }, { streamId: 'a', type: 'Drop', data: 2 }]);
    const seen: unknown[] = [];
    eng.replay((e) => seen.push(e.data), 0, (e) => e.type === 'Keep');
    expect(seen).toEqual([1]);
  });
});
