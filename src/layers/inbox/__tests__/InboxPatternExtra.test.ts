/**
 * Inbox extra tests — SequenceBuffer heap, DeadLetterInspector.
 */

import { describe, it, expect } from 'bun:test';
import { SequenceBuffer } from '../pattern/SequenceBuffer';
import { DeadLetterInspector, errorSignature, ageBucket } from '../pattern/DeadLetterInspector';
import { InboxEngine } from '../pattern/InboxEngine';
import { InboxRecord, InboxState } from '../pattern/types';

function seqRecord(seq: number, receivedAt = 0): InboxRecord {
  return {
    id: `r${seq}`, consumer: 'c', messageId: `m${seq}`, payload: {},
    sequence: seq, state: InboxState.RECEIVED, attempts: 0, receivedAt,
  };
}

describe('SequenceBuffer', () => {
  it('drains contiguous sequences in order', () => {
    const buf = new SequenceBuffer();
    for (const s of [3, 1, 4, 2, 5]) buf.push(seqRecord(s));
    const { drained, next } = buf.drainContiguous(1);
    expect(drained.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(next).toBe(6);
    expect(buf.isEmpty()).toBe(true);
  });

  it('stops at a gap and resumes when the missing record arrives', () => {
    const buf = new SequenceBuffer();
    buf.push(seqRecord(1));
    buf.push(seqRecord(3));
    let r = buf.drainContiguous(1);
    expect(r.drained.map((x) => x.sequence)).toEqual([1]);
    expect(r.next).toBe(2);
    buf.push(seqRecord(2));
    r = buf.drainContiguous(2);
    expect(r.drained.map((x) => x.sequence)).toEqual([2, 3]);
  });

  it('drains late duplicates without moving the pointer', () => {
    const buf = new SequenceBuffer();
    buf.push(seqRecord(1));
    buf.push(seqRecord(1)); // duplicate seq
    buf.push(seqRecord(2));
    const r = buf.drainContiguous(1);
    expect(r.drained).toHaveLength(3);
    expect(r.next).toBe(3);
  });

  it('overflow list captures records past capacity', () => {
    const buf = new SequenceBuffer(2);
    buf.push(seqRecord(1));
    buf.push(seqRecord(2));
    buf.push(seqRecord(3));
    expect(buf.size()).toBe(2);
    expect(buf.overflow()).toHaveLength(1);
    expect(buf.overflow()[0].sequence).toBe(3);
  });
});

describe('DeadLetterInspector', () => {
  it('error signatures normalize volatile content', () => {
    const a = errorSignature("user 42 not found at 1700000000000");
    const b = errorSignature("user 7 not found at 1799999999999");
    expect(a).toBe(b);
    const c = errorSignature("connection refused");
    expect(c).not.toBe(a);
  });

  it('clusters parked records by signature', async () => {
    let now = 0;
    const e = new InboxEngine(
      { retry: { maxAttempts: 1, backoffBaseMs: 1, backoffFactor: 1, backoffCapMs: 1, jitterFraction: 0 } },
      () => now
    );
    e.receive('c', 'm1', {});
    e.receive('c', 'm2', {});
    e.receive('c', 'm3', {});
    await e.processNext('c', () => { throw new Error('user 1 missing'); });
    await e.processNext('c', () => { throw new Error('user 2 missing'); });
    await e.processNext('c', () => { throw new Error('disk full'); });
    const insp = new DeadLetterInspector();
    const clusters = insp.cluster(e.parked('c'));
    expect(clusters).toHaveLength(2);
    expect(clusters[0].count).toBe(2); // "user <n> missing" cluster first
    const candidates = insp.redriveCandidates(e.parked('c'), 2);
    expect(candidates).toHaveLength(2);
  });

  it('age buckets classify parked records', () => {
    expect(ageBucket(60_000)).toBe('<5m');
    expect(ageBucket(3_600_000 - 1)).toBe('<1h');
    expect(ageBucket(86_400_000 - 1)).toBe('<1d');
    expect(ageBucket(90_000_000)).toBe('>=1d');
  });
});
