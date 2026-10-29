/**
 * Micro-batch stream engine tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  MicroBatchStream,
  assignWindows,
  collectAggregator,
  countAggregator,
  minMaxAggregator,
  sumAggregator,
} from '../engine/StreamEngine';
import type { StreamRecord } from '../engine/StreamEngine';

const rec = (t: number, v: number = 1, key?: string): StreamRecord<{ v: number }> => ({ value: { v }, eventTime: t, key });

describe('assignWindows', () => {
  it('tumbling assigns exactly one window', () => {
    const w = assignWindows({ kind: 'tumbling', sizeMs: 1000 }, 2500);
    expect(w).toEqual([{ start: 2000, end: 3000 }]);
  });

  it('hopping assigns overlapping windows', () => {
    // size 1000 hop 500: t=700 → windows [0,1000) and [500,1500)
    const w = assignWindows({ kind: 'hopping', sizeMs: 1000, hopMs: 500 }, 700);
    expect(w.length).toBe(2);
    expect(w[0].start).toBe(0);
    expect(w[1].start).toBe(500);
  });
});

describe('MicroBatchStream — tumbling windows', () => {
  it('aggregates records per window and closes on watermark', () => {
    const s = new MicroBatchStream<{ v: number }, { sum: number }>(
      { kind: 'tumbling', sizeMs: 1000 },
      sumAggregator((r) => r.v)
    );
    s.push(rec(100, 10));
    s.push(rec(500, 20));
    const emitted = s.push(rec(1500, 30)); // wm 1500 closes [0,1000)
    expect(emitted.length).toBe(1);
    expect(emitted[0].windowId).toBe('tumbling:0:1000:');
    expect(emitted[0].value.sum).toBe(30);
    expect(emitted[0].count).toBe(2);
    s.push(rec(2500, 40)); // wm 2500 closes [1000,2000), opens [2000,3000)
    const rest = s.flush();
    expect(rest.length).toBe(1);
    expect(rest[0].value.sum).toBe(40);
  });

  it('count aggregator via countAggregator', () => {
    const s = new MicroBatchStream<string, { n: number }>(
      { kind: 'tumbling', sizeMs: 100 },
      countAggregator<string>()
    );
    s.push({ value: 'a', eventTime: 10 });
    s.push({ value: 'b', eventTime: 20 });
    const emitted = s.push({ value: 'c', eventTime: 250 }); // wm 250 closes [0,100)
    const out = [...emitted, ...s.flush()];
    const w1 = out.find((w) => w.start === 0);
    const w2 = out.find((w) => w.start === 200);
    expect(w1?.value.n).toBe(2);
    expect(w2?.value.n).toBe(1);
  });

  it('late records beyond allowed lateness go to side output', () => {
    const s = new MicroBatchStream<{ v: number }, { sum: number }>(
      { kind: 'tumbling', sizeMs: 1000 },
      sumAggregator((r) => r.v),
      { allowedLatenessMs: 100 }
    );
    s.push(rec(5000, 1)); // watermark = 5000
    // Event at 100 is 4900 late > 100 allowed → dropped
    const emitted = s.push(rec(100, 99));
    expect(emitted.length).toBe(0);
    expect(s.lateRecords.length).toBe(1);
  });

  it('late records within tolerance still count', () => {
    const s = new MicroBatchStream<{ v: number }, { sum: number }>(
      { kind: 'tumbling', sizeMs: 1000 },
      sumAggregator((r) => r.v),
      { allowedLatenessMs: 600 }
    );
    s.push(rec(1500, 10)); // wm 1500 → window [0,1000) still open (end+600=1600)
    s.push(rec(2000, 20)); // wm 2000 → closes [0,1000)
    // window [1000,2000) contains t=1500 and t=2000? No — 2000 is next window.
    const flushed = s.flush();
    const w = flushed.find((x) => x.start === 1000);
    expect(w?.value.sum).toBe(10);
  });

  it('keyed windows aggregate per key', () => {
    const s = new MicroBatchStream<{ v: number }, { sum: number }>(
      { kind: 'tumbling', sizeMs: 1000 },
      sumAggregator((r) => r.v)
    );
    s.push(rec(100, 1, 'a'));
    s.push(rec(100, 2, 'b'));
    s.push(rec(200, 3, 'a'));
    const out = s.flush();
    const aWin = out.find((w) => w.key === 'a');
    const bWin = out.find((w) => w.key === 'b');
    expect(aWin?.value.sum).toBe(4);
    expect(bWin?.value.sum).toBe(2);
  });

  it('minMax tracks extremes', () => {
    const s = new MicroBatchStream<{ v: number }, { min: number; max: number }>(
      { kind: 'tumbling', sizeMs: 1000 },
      minMaxAggregator((r) => r.v)
    );
    s.push(rec(0, 5));
    s.push(rec(0, -3));
    s.push(rec(0, 9));
    const out = s.flush();
    expect(out[0].value.min).toBe(-3);
    expect(out[0].value.max).toBe(9);
  });

  it('collect gathers values', () => {
    const s = new MicroBatchStream<string, { items: string[] }>(
      { kind: 'tumbling', sizeMs: 100 },
      collectAggregator<string>()
    );
    s.push({ value: 'x', eventTime: 0 });
    s.push({ value: 'y', eventTime: 10 });
    const out = s.flush();
    expect(out[0].value.items).toEqual(['x', 'y']);
  });
});
