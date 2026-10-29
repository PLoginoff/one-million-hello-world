/**
 * Disaster Recovery extras — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { RetentionPolicy } from '../dr/RetentionPolicy';
import { RunbookExecutor, RunbookStep } from '../dr/RunbookExecutor';
import { ReplicationTopology } from '../dr/ReplicationTopology';
import { DrNode } from '../dr/DrTypes';

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function node(id: string, pos: bigint, healthy = true): DrNode {
  return { nodeId: id, region: 'r', position: pos, appliedPosition: pos, lastWriteAt: 0, healthy };
}

// -------------------------------------------------------------- RetentionPolicy

describe('RetentionPolicy (GFS)', () => {
  it('keeps newest backup per bucket per tier', () => {
    const clk = fakeClock();
    const p = new RetentionPolicy(
      [
        { name: 'hourly', unitMs: HOUR, keep: 2 },
        { name: 'daily', unitMs: DAY, keep: 1 },
      ],
      clk.now
    );
    // 3 backups inside the same current-hour bucket: only newest survives.
    const backups = [
      { backupId: 'old-same-hour', createdAt: clk.now() - 5 * 60_000 },
      { backupId: 'mid-same-hour', createdAt: clk.now() - 2 * 60_000 },
      { backupId: 'new-same-hour', createdAt: clk.now() - 60_000 },
      { backupId: 'prev-hour', createdAt: clk.now() - HOUR - 60_000 },
      { backupId: 'yesterday', createdAt: clk.now() - DAY - 60_000 },
    ];
    const kept = p.retained(backups);
    expect(kept).toContain('new-same-hour');
    expect(kept).toContain('prev-hour'); // 2nd newest hourly bucket
    expect(kept).not.toContain('old-same-hour');
    expect(kept).not.toContain('mid-same-hour');
  });

  it('always retains the newest backup (current recovery point)', () => {
    const clk = fakeClock();
    const p = new RetentionPolicy([{ name: 'daily', unitMs: DAY, keep: 0 }], clk.now);
    const kept = p.retained([
      { backupId: 'new', createdAt: clk.now() },
      { backupId: 'old', createdAt: clk.now() - 10 * DAY },
    ]);
    expect(kept).toContain('new');
    expect(kept).not.toContain('old');
  });

  it('prunable returns only non-kept ids', () => {
    const clk = fakeClock();
    const p = new RetentionPolicy([{ name: 'hourly', unitMs: HOUR, keep: 1 }], clk.now);
    const prunable = p.prunable([
      { backupId: 'a', createdAt: clk.now() },
      { backupId: 'b', createdAt: clk.now() - 60_000 },
    ]);
    expect(prunable).toEqual(['b']);
  });
});

// ------------------------------------------------------------- RunbookExecutor

describe('RunbookExecutor', () => {
  const step = (id: string, over: Partial<RunbookStep> = {}): RunbookStep => ({
    stepId: id,
    name: id,
    timeoutMs: 60_000,
    retries: 0,
    action: () => undefined,
    ...over,
  });

  it('runs all steps in order', async () => {
    const seen: string[] = [];
    const e = new RunbookExecutor();
    const r = await e.run('rb', [
      step('a', { action: () => void seen.push('a') }),
      step('b', { action: () => void seen.push('b') }),
    ]);
    expect(r.completed).toBe(true);
    expect(seen).toEqual(['a', 'b']);
  });

  it('retries with backoff before failing', async () => {
    const clk = fakeClock();
    const sleeps: number[] = [];
    let attempts = 0;
    const e = new RunbookExecutor(clk.now, async (ms) => {
      sleeps.push(ms);
      clk.advance(ms);
    });
    const r = await e.run('rb', [
      step('flaky', {
        retries: 2,
        backoffMs: 100,
        action: () => {
          attempts++;
          if (attempts < 3) throw new Error('not yet');
        },
      }),
    ]);
    expect(r.completed).toBe(true);
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([100, 200]); // exponential backoff
  });

  it('compensates completed steps LIFO on failure', async () => {
    const undone: string[] = [];
    const e = new RunbookExecutor();
    const r = await e.run('rb', [
      step('a', { compensate: () => void undone.push('a') }),
      step('b', { compensate: () => void undone.push('b') }),
      step('c', {
        action: () => {
          throw new Error('boom');
        },
      }),
    ]);
    expect(r.completed).toBe(false);
    expect(r.failedStepId).toBe('c');
    expect(r.compensated).toBe(true);
    expect(undone).toEqual(['b', 'a']); // reverse order
  });

  it('resumeFrom skips completed steps', async () => {
    const e = new RunbookExecutor();
    e.resumeFrom(['a']);
    let bRan = false;
    const r = await e.run('rb', [step('a'), step('b', { action: () => void (bRan = true) })]);
    expect(r.completed).toBe(true);
    expect(bRan).toBe(true);
    expect(r.steps.find((s) => s.stepId === 'a')?.status).toBe('DONE');
  });
});

// ---------------------------------------------------------- ReplicationTopology

describe('ReplicationTopology', () => {
  it('ranks promotion candidates by applied position', () => {
    const t = new ReplicationTopology();
    const p = node('p', 1000n);
    const s1 = node('s1', 900n);
    const s2 = node('s2', 980n); // least stale
    [p, s1, s2].forEach((n) => t.addNode(n));
    t.link('p', 's1');
    t.link('p', 's2');
    const cands = t.promotionCandidates('p');
    expect(cands[0].nodeId).toBe('s2');
  });

  it('unhealthy replicas rank below healthy ones', () => {
    const t = new ReplicationTopology();
    [node('p', 100n), node('s1', 99n, false), node('s2', 50n, true)].forEach((n) => t.addNode(n));
    t.link('p', 's1');
    t.link('p', 's2');
    expect(t.promotionCandidates('p')[0].nodeId).toBe('s2'); // healthy wins despite staleness
  });

  it('wouldOrphan detects chain members losing upstream', () => {
    const t = new ReplicationTopology();
    ['p', 'a', 'b'].forEach((id) => t.addNode(node(id, 0n)));
    t.link('p', 'a');
    t.link('a', 'b'); // chain p → a → b
    expect(t.wouldOrphan('a')).toEqual(['b']);
    // Killing p orphans 'a' directly; 'b' is only transitively affected
    // (direct-upstream semantics — callers compose reparent plans from this).
    expect(t.wouldOrphan('p')).toEqual(['a']);
  });

  it('reparent rewires an orphan to a surviving upstream', () => {
    const t = new ReplicationTopology();
    ['p', 'a', 'b', 's2'].forEach((id) => t.addNode(node(id, 0n)));
    t.link('p', 'a');
    t.link('a', 'b');
    t.link('p', 's2');
    t.reparent('b', 's2');
    expect(t.upstreamsOf('b').map((u) => u.nodeId)).toEqual(['s2']);
    expect(t.wouldOrphan('a')).toEqual([]); // b now under s2
  });

  it('partition marks nodes unhealthy and splits the voter set', () => {
    const t = new ReplicationTopology();
    ['a', 'b', 'c'].forEach((id) => t.addNode(node(id, 0n)));
    const { survivors, partitioned } = t.partition(['a']);
    expect(partitioned.map((n) => n.nodeId)).toEqual(['a']);
    expect(survivors.map((n) => n.nodeId).sort()).toEqual(['b', 'c']);
    expect(t.node('a')?.healthy).toBe(false);
    t.heal(['a']);
    expect(t.node('a')?.healthy).toBe(true);
  });
});
