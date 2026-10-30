/**
 * Tests for WriteModel engine2 — CommandDedup, ValidationPipeline,
 * AggregateArchiver, WriteBehindBuffer, ConflictResolver.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CommandDedup } from '../CommandDedup';
import {
  ValidationPipeline,
  requiredFields,
  schemaShape,
  expectedVersion,
  invariant,
} from '../ValidationPipeline';
import { AggregateArchiver, HotAggregate } from '../AggregateArchiver';
import { WriteBehindBuffer, BufferedEvent } from '../WriteBehindBuffer';
import { resolveConflicts, isConcurrent, mergers, Write } from '../ConflictResolver';
import { ManualWmClock2, WmCommand, CommandReceipt } from '../types';

const cmd = (over: Partial<WmCommand> = {}): WmCommand => ({
  commandId: 'c1',
  idempotencyKey: 'idem-1',
  type: 'orders.create',
  aggregateId: 'o1',
  payload: { item: 'book', qty: 2 },
  issuedAtMs: 0,
  ...over,
});

const receipt: CommandReceipt = {
  commandId: 'c1',
  idempotencyKey: 'idem-1',
  accepted: true,
  eventsProduced: 1,
};

describe('CommandDedup', () => {
  let clock: ManualWmClock2;
  let d: CommandDedup;

  beforeEach(() => {
    clock = new ManualWmClock2(0);
    d = new CommandDedup({ ttlMs: 5000, clock });
  });

  it('first sighting is new, same key+payload is duplicate after complete', () => {
    const c = cmd();
    expect(d.check(c).status).toBe('new');
    expect(d.check(c).status).toBe('in-flight'); // still executing
    d.complete(c.idempotencyKey, receipt);
    const v = d.check(c);
    expect(v.status).toBe('duplicate');
    expect(v.receipt?.commandId).toBe('c1');
  });

  it('same key different payload is conflict', () => {
    d.check(cmd());
    expect(d.check(cmd({ payload: { item: 'pen', qty: 1 } })).status).toBe('conflict');
  });

  it('fail() clears the record so a retry is new', () => {
    const c = cmd();
    d.check(c);
    d.fail(c.idempotencyKey);
    expect(d.check(c).status).toBe('new');
  });

  it('records expire after ttl', () => {
    d.check(cmd());
    clock.advance(6000);
    const v = d.check(cmd());
    expect(v.status).toBe('new');
    expect(v.expired).toBe(true);
  });

  it('sweep evicts expired records', () => {
    d.check(cmd());
    d.check(cmd({ commandId: 'c2', idempotencyKey: 'idem-2' }));
    clock.advance(6000);
    expect(b_sweep(d)).toBe(2);
    expect(b_size(d)).toBe(0);
  });
});

describe('ValidationPipeline', () => {
  it('collects ALL violations (no fail-fast)', () => {
    const p = new ValidationPipeline()
      .add('req', requiredFields(['item', 'qty', 'price']))
      .add('shape', schemaShape({ qty: 'number', price: 'number' }));
    const v = p.run({ command: cmd({ payload: { item: 'book' } }) });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const fields = v.violations.map((x) => x.field);
      expect(fields).toContain('qty');
      expect(fields).toContain('price');
      expect(v.violations.filter((x) => x.rule === 'required')).toHaveLength(2);
    }
  });

  it('schemaShape checks types', () => {
    const t = new ValidationPipeline().add('shape', schemaShape({ qty: 'number', tags: 'array' }));
    const v = t.run({ command: cmd({ payload: { qty: 'two', tags: 'x' } }) });
    expect(v.ok).toBe(false);
    if (!t_verdict_ok(v)) {
      expect(v.violations).toHaveLength(2);
    }
  });

  it('expectedVersion matches loaded aggregate version', () => {
    const t = new ValidationPipeline().add('ver', expectedVersion());
    const agg = { version: 7, state: {} };
    expect(t.run({ command: cmd({ expectedVersion: 7 }), aggregate: agg }).ok).toBe(true);
    const bad = t.run({ command: cmd({ expectedVersion: 3 }), aggregate: agg });
    expect(t_ok(bad)).toBe(false);
  });

  it('invariant predicates run against aggregate state', () => {
    const t = new ValidationPipeline().add(
      'open',
      invariant('open-only', (c) => c.aggregate?.state['status'] === 'open', 'aggregate must be open')
    );
    const open = { version: 1, state: { status: 'open' } };
    const closed = { version: 1, state: { status: 'closed' } };
    expect(t.run({ command: cmd(), aggregate: open }).ok).toBe(true);
    expect(t.run({ command: cmd(), aggregate: closed }).ok).toBe(false);
  });

  it('a throwing validator halts pipeline with rule-error violation', () => {
    const t = new ValidationPipeline()
      .add('bad', () => {
        throw new Error('boom');
      })
      .add('never', allow_rule());
    const v = t.run({ command: cmd() });
    expect(t_ok(v)).toBe(false);
    if (!t_ok(v)) {
      expect(t_violation_rule(v)).toContain('bad');
    }
  });
});

describe('AggregateArchiver', () => {
  let clock: ManualWmClock2;
  let ar: AggregateArchiver;
  const agg = (id: string, lastMs: number, status = 'closed'): HotAggregate => ({
    aggregateId: id,
    type: 'Order',
    version: 5,
    state: { status },
    lastEventAtMs: lastMs,
  });

  beforeEach(() => {
    clock = new ManualWmClock2(10_000);
    ar = new AggregateArchiver({
      coldAfterMs: 5000,
      isTerminal: (a) => a.state['status'] === 'closed',
      clock,
    });
  });

  it('archives old terminal aggregates', () => {
    const v = ar.archive(agg('a1', 1000));
    expect(v.kind).toBe('archived');
    expect(b_iscold(ar, 'a1')).toBe(true);
    expect(ar.coldCount).toBe(1);
  });

  it('rejects too-recent and non-terminal aggregates', () => {
    expect(ar.archive(agg('recent', 9000)).kind).toBe('too-recent');
    expect(ar.archive(agg('running', 1000, 'running')).kind).toBe('not-terminal');
  });

  it('thaw restores state with checksum verification', () => {
    const a1 = { aggregateId: 'a1', type: 'Order', version: 5, state: { status: 'closed', total: 42 }, lastEventAtMs: 1000 };
    b_archive(ar, a1);
    const hot = b_thaw(ar, 'a1');
    expect(b_nonnull(hot) && hot.state['total']).toBe(42);
    expect(b_iscold(ar, 'a1')).toBe(false);
    expect(b_thaw(ar, 'ghost')).toBeNull();
  });

  it('eligible() scans hot aggregates for archive candidates', () => {
    const hot = [agg('old-closed', 1000), agg('old-open', 1000, 'running'), agg('fresh', 9000)];
    expect(ar.eligible(hot)).toEqual(['old-closed']);
  });
});

describe('WriteBehindBuffer', () => {
  let clock: ManualWmClock2;

  beforeEach(() => {
    clock = new ManualWmClock2(0);
  });

  const ev = (i: number): Omit<BufferedEvent, 'appendedAtMs'> => ({
    stream: 'orders',
    position: i,
    type: 'created',
    payload: { i },
  });

  it('buffers then flushes through the sink in order', () => {
    const sink: number[][] = [];
    const wb = new WriteBehindBuffer({
      maxBuffered: 10,
      sink: (evs) => {
        sink.push(evs.map((e) => e.position));
        return evs.length;
      },
      clock,
    });
    for (let i = 0; i < 3; i++) wb.append(ev(i));
    expect(b_buffered(wb)).toBe(3);
    const r = b_flush(wb);
    expect(r.kind).toBe('flushed');
    expect(sink[0]).toEqual([0, 1, 2]);
    expect(b_buffered(wb)).toBe(0);
  });

  it('backpressures at maxBuffered and reports dropped', () => {
    const wb = new WriteBehindBuffer({ maxBuffered: 2, sink: (e) => e.length, clock });
    wb.append(ev(0));
    wb.append(ev(1));
    expect(b_append(wb, ev(2))).toBe(false);
    expect(b_dropped(wb)).toBe(1);
  });

  it('maybeFlush triggers on age', () => {
    const wb = new WriteBehindBuffer({ flushIntervalMs: 100, sink: (e) => e.length, clock });
    wb.append(ev(0));
    expect(b_maybeflush(wb)).toBeNull();
    clock.advance(150);
    const r = b_maybeflush(wb);
    expect(r?.kind).toBe('flushed');
  });

  it('sink failure keeps the batch for retry (at-least-once)', () => {
    let fail = true;
    const wb = new WriteBehindBuffer({
      sink: (e) => {
        if (fail) throw new Error('io');
        return e.length;
      },
      clock,
    });
    b_append(wb, ev(0));
    expect(b_flush(wb).kind).toBe('error');
    expect(b_buffered(wb)).toBe(1); // batch retained
    fail = false;
    expect(b_flush(wb).kind).toBe('flushed');
    expect(b_buffered(wb)).toBe(0);
  });
});

describe('ConflictResolver', () => {
  const w = (writerId: string, ts: number, fields: Record<string, unknown>, seq = 0): Write => ({
    writerId,
    timestampMs: ts,
    fields,
    seq,
  });

  it('LWW picks the later write per field', () => {
    const { fields, conflicts } = resolveConflicts(
      [w('A', 100, { title: 'old' }), w('B', 200, { title: 'new' })],
      'lww'
    );
    expect(fields['title']).toBe('new');
    expect(conflicts[0].winner).toBe('B@200');
  });

  it('FWW keeps the earlier write', () => {
    const { fields } = resolveConflicts(
      [w('A', 200, { title: 'late' }), w('B', 100, { title: 'early' })],
      'fww'
    );
    expect(fields['title']).toBe('early');
  });

  it('merge applies per-field merge functions', () => {
    const { fields } = resolveConflicts(
      [w('A', 100, { clicks: 5, tags: ['a'] }), w('B', 200, { clicks: 3, tags: ['b'] })],
      'merge',
      { clicks: mergers.sum, tags: mergers.union }
    );
    expect(fields['clicks']).toBe(8);
    expect(new Set(fields['tags'] as string[])).toEqual(new Set(['a', 'b']));
  });

  it('merge without a per-field merger falls back to lww inside merge mode', () => {
    const { fields } = resolveConflicts(
      [w('A', 100, { title: 'old' }), w('B', 200, { title: 'new' })],
      'merge'
    );
    expect(fields['title']).toBe('new'); // lww inside merge
  });

  it('isConcurrent detects non-dominating version vectors', () => {
    expect(isConcurrent({ a: 2, b: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(isConcurrent({ a: 2, b: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(isConcurrent({ a: 1 }, { b: 1 })).toBe(true);
  });
});

// helpers
function t_ok(v: unknown): boolean {
  return (v as { ok: boolean }).ok;
}
function t_verdict_ok(v: unknown): boolean {
  return (v as { ok: boolean }).ok;
}
function t_violation_rule(v: { violations: { rule: string }[] }): string {
  return v.violations[0].rule;
}
function allow_rule() {
  return () => [];
}
function b_sweep(d: CommandDedup): number {
  return d.sweep();
}
function b_size(d: CommandDedup): number {
  return d.size;
}
function b_iscold(a: AggregateArchiver, id: string): boolean {
  return a.isCold(id);
}
function b_archive(a: AggregateArchiver, h: HotAggregate): void {
  a.archive(h);
}
function b_thaw(a: AggregateArchiver, id: string): HotAggregate | null {
  return a.thaw(id);
}
function b_nonnull<T>(v: T | null): v is T {
  return v !== null;
}
function b_buffered(w: WriteBehindBuffer): number {
  return w.buffered;
}
function b_flush(w: WriteBehindBuffer) {
  return w.flush();
}
function b_append(w: WriteBehindBuffer, e: Omit<BufferedEvent, 'appendedAtMs'>): boolean {
  return w.append(e);
}
function b_dropped(w: WriteBehindBuffer): number {
  return w.droppedCount;
}
function b_maybeflush(w: WriteBehindBuffer) {
  return w.maybeFlush();
}
