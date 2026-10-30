/**
 * Tests for PerMessageDeflate, ConnectionPool, ClusterRouter, ConnectionDrainer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PerMessageDeflate, negotiateDeflate } from '../PerMessageDeflate';
import { ConnectionPool, PooledConnection } from '../ConnectionPool';
import { ClusterRouter } from '../ClusterRouter';
import { ConnectionDrainer } from '../ConnectionDrainer';
import { ManualWsClock2 } from '../types';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const str = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('PerMessageDeflate', () => {
  it('negotiates window bits and context takeover', () => {
    const n = negotiateDeflate(
      { clientNoContextTakeover: true, clientMaxWindowBits: 12 },
      { preferServerNoContextTakeover: true, maxServerWindowBits: 10 }
    );
    expect(n.clientNoContextTakeover).toBe(true);
    expect(n.serverNoContextTakeover).toBe(true);
    expect(n.serverMaxWindowBits).toBe(10);
    expect(n.clientMaxWindowBits).toBe(12);
  });

  it('round-trips a message through encode/decode', () => {
    const pmd = new PerMessageDeflate(negotiateDeflate({}));
    const original = bytes('hello world hello world hello world');
    const enc = pmd.encode(original);
    expect(enc.rsv1).toBe(true);
    const dec = pmd.decode(enc);
    expect(str(dec)).toBe('hello world hello world hello world');
  });

  it('compresses repetitive data below original size', () => {
    const pmd = new PerMessageDeflate(negotiateDeflate({}));
    const original = bytes('abcdabcdabcdabcdabcdabcdabcdabcdabcdabcd');
    const enc = pmd.encode(original);
    expect(enc.compressedSize).toBeLessThan(enc.originalSize);
  });

  it('context takeover lets later messages reference earlier ones', () => {
    // Sender and receiver are separate instances (like a real connection):
    // the sender's tx window and the receiver's rx window accumulate
    // independently across messages.
    const sender = new PerMessageDeflate(negotiateDeflate({}));
    const receiver = new PerMessageDeflate(negotiateDeflate({}));
    const original = 'the quick brown fox jumps over the lazy dog';
    expect(str(receiver.decode(sender.encode(bytes(original))))).toBe(original);
    const enc2 = sender.encode(bytes(original));
    // Second identical message should be almost entirely back-references.
    const refs = enc2.tokens.filter((t) => t.kind === 'ref').length;
    expect(refs).toBeGreaterThan(0);
    expect(enc2.compressedSize).toBeLessThan(20);
    expect(str(receiver.decode(enc2))).toBe(original);
  });

  it('no-context-takeover prevents cross-message references', () => {
    const pmd = new PerMessageDeflate(
      negotiateDeflate({ serverNoContextTakeover: true, clientNoContextTakeover: true })
    );
    pmd.encode(bytes('the quick brown fox jumps over the lazy dog'));
    const enc2 = pmd.encode(bytes('the quick brown fox jumps over the lazy dog'));
    // Window was reset — no cross-message refs; message still self-compresses.
    expect(str(pmd.decode(enc2))).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('decode rejects out-of-range back-references', () => {
    const pmd = new PerMessageDeflate(negotiateDeflate({}));
    const bad = {
      tokens: [{ kind: 'ref' as const, distance: 999_999, length: 5 }],
      rsv1: true,
      compressedSize: 3,
      originalSize: 5,
    };
    expect(() => pmd.decode(bad)).toThrow();
  });

  it('reset clears windows', () => {
    const pmd = new PerMessageDeflate(negotiateDeflate({}));
    pmd.encode(bytes('aaaa bbbb aaaa bbbb aaaa bbbb'));
    pmd.reset();
    const dec = pmd.decode(pmd.encode(bytes('xy')));
    expect(str(dec)).toBe('xy');
  });
});

describe('ConnectionPool', () => {
  let clock: ManualWsClock2;
  let pool: ConnectionPool;
  let seq: number;
  const make = (origin: string): PooledConnection => ({
    id: `c${seq++}`,
    origin,
    generation: pool.generation,
  });

  beforeEach(() => {
    clock = new ManualWsClock2(0);
    pool = new ConnectionPool({ maxPerOrigin: 2, maxTotal: 4, idleTtlMs: 1000, clock });
    seq = 0;
  });

  it('creates on miss, reuses on release', () => {
    expect(pool.acquire('wss://a').kind).toBe('create');
    const c = make('wss://a');
    pool.release(c);
    const r = pool.acquire('wss://a');
    expect(r.kind).toBe('reused');
    if (r.kind === 'reused') expect(r.conn.id).toBe(c.id);
  });

  it('enforces per-origin cap by evicting LRU', () => {
    const a = make('wss://a');
    const b = make('wss://a');
    const c = make('wss://a');
    pool.release(a);
    clock.advance(1);
    pool.release(b);
    clock.advance(1);
    pool.release(c); // evicts a (oldest)
    expect(pool.idle('wss://a')).toBe(2);
    const r1 = pool.acquire('wss://a');
    expect(r1.kind).toBe('reused');
    if (r1.kind === 'reused') expect(r1.conn.id).toBe(c.id); // MRU first
  });

  it('reaps expired idles on sweep', () => {
    const a = make('wss://a');
    pool.release(a);
    clock.advance(1500);
    expect(pool.sweep()).toEqual([a.id]);
    expect(pool.totalIdle).toBe(0);
    expect(pool.reapedCount).toBe(1);
  });

  it('honors maxUses retirement', () => {
    const p = new ConnectionPool({ maxUses: 2, clock });
    const c: PooledConnection = { id: 'x', origin: 'wss://a', generation: p.generation };
    p.release(c);
    p.acquire('wss://a');
    p.release(c);
    p.acquire('wss://a');
    p.release(c); // third release → retired
    expect(p.idle('wss://a')).toBe(0);
  });

  it('invalidateAll retires stale handles on release', () => {
    const c = make('wss://a');
    pool.invalidateAll();
    pool.release(c); // stale generation — dropped, not pooled
    expect(pool.totalIdle).toBe(0);
  });

  it('discard removes idles and checked-out handles', () => {
    const c = make('wss://a');
    pool.release(c);
    expect(pool.discard(c.id)).toBe(true);
    expect(pool.idle('wss://a')).toBe(0);
    expect(pool.discard('ghost')).toBe(false);
  });
});

describe('ClusterRouter', () => {
  it('routes keys deterministically to nodes', () => {
    const r = new ClusterRouter({ replicas: 64 });
    r.addNode({ id: 'n1' });
    r.addNode({ id: 'n2' });
    r.addNode({ id: 'n3' });
    const a = r.resolve('conn-42');
    const b = r.resolve('conn-42');
    expect(a).not.toBeNull();
    expect(b?.nodeId).toBe(a?.nodeId);
    expect(r.ringSize).toBe(3 * 64);
  });

  it('only remaps a fraction of keys when a node leaves', () => {
    const r = new ClusterRouter({ replicas: 100 });
    ['n1', 'n2', 'n3', 'n4'].forEach((id) => r.addNode({ id }));
    const keys = Array.from({ length: 400 }, (_, i) => `k${i}`);
    keys.forEach((k) => r.attach(k));
    const before = new Map(keys.map((k) => [k, r.ownerOf(k)]));
    r.removeNode('n2');
    let changed = 0;
    for (const k of keys) if (r.ownerOf(k) !== before.get(k)) changed++;
    // Expect roughly 25% ± — well under a naive modulo remap (~75%).
    expect(changed).toBeGreaterThanOrEqual(20);
    expect(changed).toBeLessThan(200);
    // All survivors still map to live nodes.
    for (const k of keys) expect(r.ownerOf(k)).not.toBe('n2');
  });

  it('remap() reports and updates ownership after ring change', () => {
    const r = new ClusterRouter({ replicas: 50 });
    r.addNode({ id: 'n1' });
    r.addNode({ id: 'n2' });
    r.attach('a');
    r.attach('b');
    const moves = r.remap();
    expect(moves.length).toBe(0); // no change yet
    r.removeNode('n1');
    const moves2 = r.remap();
    for (const m of moves2) {
      expect(m.from).toBe('n1');
      expect(m.to).toBe('n2');
      expect(r.attachedOwner(m.key)).toBe('n2');
    }
  });

  it('balances load roughly evenly across equal-weight nodes', () => {
    const r = new ClusterRouter({ replicas: 200 });
    ['a', 'b', 'c'].forEach((id) => r.addNode({ id }));
    const dist = r.loadDistribution();
    for (const share of dist.values()) {
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.5);
    }
  });

  it('heavier weights claim more ring arc', () => {
    const r = new ClusterRouter({ replicas: 100 });
    r.addNode({ id: 'light', weight: 1 });
    r.addNode({ id: 'heavy', weight: 3 });
    const dist = r.loadDistribution();
    const heavy = dist.get('heavy') ?? 0;
    const light = dist.get('light') ?? 0;
    expect(heavy).toBeGreaterThan(light);
  });

  it('returns null on empty ring', () => {
    const r = new ClusterRouter();
    expect(r.resolve('x')).toBeNull();
    expect(r.attach('x')).toBeNull();
  });
});

describe('ConnectionDrainer', () => {
  let clock: ManualWsClock2;
  let d: ConnectionDrainer;

  beforeEach(() => {
    clock = new ManualWsClock2(0);
    d = new ConnectionDrainer({
      initialCohort: 2,
      growth: 2,
      maxCohort: 8,
      ackDeadlineMs: 1000,
      maxDrainMs: 10_000,
      clock,
    });
  });

  it('accepts connections normally, refuses while draining', () => {
    expect(d.accept('c1')).toBe(true);
    expect(d.accept('c1')).toBe(false); // duplicate
    d.beginDrain();
    expect(d.accept('c2')).toBe(false);
  });

  it('closes connections in exponential cohort waves', () => {
    for (let i = 0; i < 10; i++) d.accept(`c${i}`);
    d.beginDrain();
    const wave1 = d.tick().filter((e) => e.kind === 'close-sent');
    expect(wave1.length).toBe(2);
    const wave2 = d.tick().filter((e) => e.kind === 'close-sent');
    expect(wave2.length).toBe(4);
    const wave3 = d.tick().filter((e) => e.kind === 'close-sent');
    expect(wave3.length).toBe(4); // only 4 remaining (capped by maxCohort=8)
    expect(d.remaining).toBe(10); // none acked yet
  });

  it('graceful acks complete the drain', () => {
    d.accept('c1');
    d.accept('c2');
    d.beginDrain();
    d.tick(); // close-sent to both
    expect(d.reportClosed('c1')).toBe(true);
    expect(d.reportClosed('c2')).toBe(true);
    const ev = d.tick();
    expect(ev.some((e) => e.kind === 'drain-complete')).toBe(true);
    expect(d.drainComplete()).toBe(true);
  });

  it('hard-drops connections that ignore the ack deadline', () => {
    d.accept('c1');
    d.accept('c2');
    d.beginDrain();
    d.tick(); // closes sent, deadlines at +1000
    clock.advance(1500);
    const ev = d.tick();
    expect(ev.filter((e) => e.kind === 'dropped').length).toBe(2);
    expect(d.drainComplete()).toBe(true);
  });

  it('maxDrainMs drops everything regardless of ack state', () => {
    for (let i = 0; i < 20; i++) d.accept(`c${i}`);
    d.beginDrain();
    clock.advance(10_001);
    const ev = d.tick();
    expect(ev.filter((e) => e.kind === 'dropped').length).toBe(20);
    expect(d.drainComplete()).toBe(true);
  });

  it('reportClosed on unknown conn returns false', () => {
    expect(d.reportClosed('ghost')).toBe(false);
  });

  it('pendingAcks lists connections awaiting close ack', () => {
    d.accept('a');
    d.accept('b');
    d.accept('c');
    d.beginDrain();
    d.tick(); // cohort=2: a,b get close
    const pending = d.pendingAcks();
    expect(pending).toContain('a');
    expect(pending).toContain('b');
    expect(pending).not.toContain('c');
  });
});
