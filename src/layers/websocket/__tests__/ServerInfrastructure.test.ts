/**
 * Tests for the websocket server-side infrastructure:
 * ConnectionRateLimiter, SendQueue, ResumeBuffer + tokens, RoomManager,
 * PresenceRegistry, UpgradeRouter.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConnectionRateLimiter, ViolationAction } from '../server/ConnectionRateLimiter';
import { SendQueue, BackpressurePolicy, DropReason } from '../server/SendQueue';
import type { QueuedSend } from '../server/SendQueue';
import {
  ResumeBuffer,
  ResumeTokenIssuer,
  TestResumeTokenSigner,
  HmacResumeTokenSigner,
} from '../server/ResumeBuffer';
import { RoomManager, JoinRejectedError } from '../server/RoomManager';
import { PresenceRegistry, PresenceState } from '../server/PresenceRegistry';
import type { PresenceEvent } from '../server/PresenceRegistry';
import { UpgradeRouter, RoutePattern } from '../server/UpgradeRouter';
import type { UpgradeDecision } from '../server/UpgradeRouter';
import { FrameCodec } from '../protocol/FrameCodec';
import { WsOpcode } from '../protocol/types';
import { buildClientHandshake } from '../protocol/Handshake';
import { parseHandshakeRequest } from '../protocol/Handshake';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function manualClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    set: (v: number) => {
      now = v;
    },
  };
}

/** Build a valid handshake request for `path`. */
function handshakeFor(path: string, extraHeaders?: Record<string, string>) {
  const { requestText } = buildClientHandshake({
    host: 'test.local',
    path,
    extraHeaders,
  });
  return parseHandshakeRequest(requestText.trimEnd());
}

function textFrame(payload: string): Buffer {
  return FrameCodec.encode(WsOpcode.TEXT, Buffer.from(payload, 'utf8'), { mask: true });
}

/* ------------------------------------------------------------------ */
/* ConnectionRateLimiter                                               */
/* ------------------------------------------------------------------ */

describe('ConnectionRateLimiter', () => {
  it('admits up to capacity instantly, then rejects', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({ ratePerSec: 10, capacity: 3, now: clock.now });
    expect(rl.admit().allowed).toBe(true);
    expect(rl.admit().allowed).toBe(true);
    expect(rl.admit().allowed).toBe(true);
    const d = rl.admit();
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills tokens at the sustained rate', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({ ratePerSec: 10, capacity: 2, now: clock.now });
    rl.admit();
    rl.admit();
    expect(rl.admit().allowed).toBe(false);
    clock.advance(200); // 2 tokens at 10/sec
    expect(rl.admit().allowed).toBe(true);
    expect(rl.admit().allowed).toBe(true);
    expect(rl.admit().allowed).toBe(false);
  });

  it('reports retryAfterMs proportional to the deficit', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({ ratePerSec: 4, capacity: 1, now: clock.now });
    rl.admit();
    const d = rl.admit();
    expect(d.allowed).toBe(false);
    // 1 token deficit at 4 tokens/sec = 250ms
    expect(d.retryAfterMs).toBeCloseTo(250, 0);
  });

  it('decays the violation score exponentially', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({
      ratePerSec: 1,
      capacity: 1,
      violationHalfLifeMs: 1000,
      now: clock.now,
    });
    rl.admit();
    rl.admit(); // rejection: +1 violation
    const s1 = rl.violationScore;
    expect(s1).toBeCloseTo(1, 5);
    clock.advance(1000); // one half-life
    const s2 = rl.violationScore;
    expect(s2).toBeLessThan(s1);
    expect(s2).toBeGreaterThan(0.4);
  });

  it('maps violation score to escalation actions', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({ ratePerSec: 1, capacity: 1, now: clock.now });
    rl.admit();
    for (let i = 0; i < 3; i++) rl.admit(); // 3 violations
    expect(rl.violationPolicy(2, 5)).toBe(ViolationAction.WARN);
    for (let i = 0; i < 3; i++) rl.admit();
    expect(rl.violationPolicy(2, 5)).toBe(ViolationAction.CLOSE);
  });

  it('reset clears both tokens and violations', () => {
    const clock = manualClock();
    const rl = new ConnectionRateLimiter({ ratePerSec: 1, capacity: 2, now: clock.now });
    rl.admit();
    rl.admit();
    rl.admit();
    rl.reset();
    expect(rl.violationScore).toBe(0);
    expect(rl.admit().allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* SendQueue                                                           */
/* ------------------------------------------------------------------ */

describe('SendQueue', () => {
  const opts = {
    highWaterMarkBytes: 100,
    maxBytes: 300,
    now: () => 0,
  };

  function collect() {
    const sent: Buffer[] = [];
    return {
      sent,
      sink: (e: QueuedSend) => {
        sent.push(e.payload);
        return true;
      },
      stalling: { stall: false } as { stall: boolean },
    };
  }

  it('drains through a synchronous sink immediately', () => {
    const { sent, sink } = collect();
    const q = new SendQueue(sink, opts);
    expect(q.enqueue(Buffer.from('a'))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(q.bufferedBytes).toBe(0);
  });

  it('buffers while the sink stalls, flushes on notifyWritable', () => {
    const sent: Buffer[] = [];
    let stall = true;
    const q = new SendQueue(
      (e) => {
        if (stall) return false;
        sent.push(e.payload);
        return true;
      },
      opts
    );
    q.enqueue(Buffer.from('x'));
    q.enqueue(Buffer.from('y'));
    expect(sent).toHaveLength(0);
    expect(q.bufferedBytes).toBeGreaterThan(0);
    stall = false;
    q.notifyWritable();
    expect(sent.map((b) => b.toString())).toEqual(['x', 'y']);
  });

  it('reports overHighWaterMark in the pressure zone', () => {
    const q = new SendQueue(() => false, {
      ...opts,
      perMessageOverhead: 0,
    });
    q.enqueue(Buffer.alloc(60));
    expect(q.overHighWaterMark).toBe(false);
    q.enqueue(Buffer.alloc(60));
    expect(q.overHighWaterMark).toBe(true);
  });

  it('DROP_NEWEST rejects incoming over maxBytes', () => {
    const dropped: QueuedSend[] = [];
    const q = new SendQueue(() => false, {
      ...opts,
      perMessageOverhead: 0,
      policy: BackpressurePolicy.DROP_NEWEST,
      onDrop: (e) => dropped.push(e),
    });
    q.enqueue(Buffer.alloc(200));
    expect(q.enqueue(Buffer.alloc(150))).toBe(false); // 200+150 > 300
    expect(dropped).toHaveLength(1);
    expect(q.stats().totalDropped).toBe(1);
  });

  it('DROP_OLDEST evicts head entries to make room', () => {
    const dropped: QueuedSend[] = [];
    const q = new SendQueue(() => false, {
      ...opts,
      perMessageOverhead: 0,
      policy: BackpressurePolicy.DROP_OLDEST,
      onDrop: (e, reason) => {
        expect(reason).toBe(DropReason.EVICTED);
        dropped.push(e);
      },
    });
    q.enqueue(Buffer.from('first'));
    q.enqueue(Buffer.alloc(299));
    // 'first' (5 bytes) evicted: 5+299 > 300 → keeps only the big one.
    expect(dropped.map((d) => d.payload.toString())).toEqual(['first']);
    expect(q.bufferedBytes).toBe(299);
  });

  it('CLOSE policy trips once and rejects everything after', () => {
    let closed = 0;
    const q = new SendQueue(() => false, {
      ...opts,
      perMessageOverhead: 0,
      policy: BackpressurePolicy.CLOSE,
      onPolicyClose: () => closed++,
    });
    q.enqueue(Buffer.alloc(290));
    expect(q.enqueue(Buffer.alloc(50))).toBe(false);
    expect(closed).toBe(1);
    expect(q.closedByPolicy).toBe(true);
    expect(q.enqueue(Buffer.alloc(1))).toBe(false);
    expect(closed).toBe(1); // fires exactly once
    expect(q.stats().bytesDropped).toBe(340);
  });

  it('respects the maxMessages cap independently of bytes', () => {
    const q = new SendQueue(() => false, {
      ...opts,
      maxBytes: 1_000_000,
      maxMessages: 2,
      policy: BackpressurePolicy.DROP_NEWEST,
    });
    q.enqueue(Buffer.alloc(1));
    q.enqueue(Buffer.alloc(1));
    expect(q.enqueue(Buffer.alloc(1))).toBe(false);
  });

  it('clear() drops everything with CLEARED reason', () => {
    const reasons: DropReason[] = [];
    const q = new SendQueue(() => false, {
      ...opts,
      onDrop: (_e, r) => reasons.push(r),
    });
    q.enqueue(Buffer.alloc(10));
    q.enqueue(Buffer.alloc(10));
    q.clear();
    expect(reasons).toEqual([DropReason.CLEARED, DropReason.CLEARED]);
    expect(q.bufferedBytes).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* ResumeBuffer + tokens                                               */
/* ------------------------------------------------------------------ */

describe('ResumeBuffer', () => {
  it('sequences appended messages monotonically', () => {
    const buf = new ResumeBuffer({ firstSeq: 10, now: () => 0 });
    const a = buf.append(Buffer.from('a'));
    const b = buf.append(Buffer.from('b'));
    expect(a.seq).toBe(10);
    expect(b.seq).toBe(11);
    expect(buf.nextSeq).toBe(12);
  });

  it('replays everything after lastSeq', () => {
    const buf = new ResumeBuffer({ now: () => 0 });
    buf.append(Buffer.from('m1'));
    buf.append(Buffer.from('m2'));
    buf.append(Buffer.from('m3'));
    const res = buf.replayAfter(1);
    expect(res.kind).toBe('replay');
    if (res.kind === 'replay') {
      expect(res.messages.map((m) => m.payload.toString())).toEqual(['m2', 'm3']);
      expect(res.nextSeq).toBe(4);
    }
  });

  it('returns empty replay when nothing was missed', () => {
    const buf = new ResumeBuffer({ now: () => 0 });
    buf.append(Buffer.from('x'));
    const res = buf.replayAfter(1);
    expect(res.kind).toBe('replay');
    if (res.kind === 'replay') expect(res.messages).toHaveLength(0);
  });

  it('signals GAP when the client fell out of the window', () => {
    const buf = new ResumeBuffer({ maxEntries: 2, now: () => 0 });
    buf.append(Buffer.from('a'));
    buf.append(Buffer.from('b'));
    buf.append(Buffer.from('c')); // evicts 'a'
    const res = buf.replayAfter(0);
    expect(res.kind).toBe('gap');
    if (res.kind === 'gap') {
      expect(res.oldestAvailableSeq).toBe(2);
    }
  });

  it('evicts oldest entries over the byte cap', () => {
    const buf = new ResumeBuffer({ maxBytes: 100, perMessageOverhead: 0, now: () => 0 });
    buf.append(Buffer.alloc(60));
    buf.append(Buffer.alloc(60)); // evicts the first
    expect(buf.size.entries).toBe(1);
    expect(buf.evictedCount).toBe(1);
    expect(buf.oldestSeq).toBe(2);
  });

  it('replay via binary search hits exact boundary', () => {
    const buf = new ResumeBuffer({ now: () => 0 });
    for (let i = 0; i < 50; i++) buf.append(Buffer.from(`m${i}`));
    const res = buf.replayAfter(25);
    expect(res.kind).toBe('replay');
    if (res.kind === 'replay') {
      expect(res.messages[0].seq).toBe(26);
      expect(res.messages).toHaveLength(25);
    }
  });
});

describe('ResumeTokenIssuer', () => {
  const signer = new TestResumeTokenSigner();
  const issuer = new ResumeTokenIssuer(signer);

  it('round-trips connectionId + lastSeq', () => {
    const token = issuer.issue('conn-abc', 42);
    const parsed = issuer.verify(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.connectionId).toBe('conn-abc');
    expect(parsed?.lastSeq).toBe(42);
  });

  it('rejects tampered tokens', () => {
    const token = issuer.issue('conn-abc', 42);
    const raw = Buffer.from(token, 'base64url');
    raw[5] ^= 0xff;
    expect(issuer.verify(raw.toString('base64url'))).toBeNull();
  });

  it('rejects garbage input without throwing', () => {
    expect(issuer.verify('not-a-token')).toBeNull();
    expect(issuer.verify('')).toBeNull();
  });

  it('HMAC signer produces verifiable tokens', () => {
    const hmacIssuer = new ResumeTokenIssuer(new HmacResumeTokenSigner('s3cr3t'));
    const token = hmacIssuer.issue('c1', 7);
    expect(hmacIssuer.verify(token)?.lastSeq).toBe(7);
    const other = new ResumeTokenIssuer(new HmacResumeTokenSigner('different'));
    expect(other.verify(token)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* RoomManager                                                         */
/* ------------------------------------------------------------------ */

describe('RoomManager', () => {
  let sends: Map<string, { payload: Buffer | string; binary: boolean }[]>;
  let rooms: RoomManager;

  beforeEach(() => {
    sends = new Map();
    rooms = new RoomManager((connId, payload, binary) => {
      const list = sends.get(connId) ?? [];
      list.push({ payload, binary });
      sends.set(connId, list);
      return true;
    });
  });

  it('join is idempotent', () => {
    expect(rooms.join('r', 'c1')).toBe(true);
    expect(rooms.join('r', 'c1')).toBe(false);
    expect(rooms.memberCount('r')).toBe(1);
  });

  it('leave is idempotent and deletes empty rooms', () => {
    rooms.join('r', 'c1');
    expect(rooms.leave('r', 'c1')).toBe(true);
    expect(rooms.leave('r', 'c1')).toBe(false);
    expect(rooms.roomCount).toBe(0);
  });

  it('broadcast delivers to all members', () => {
    rooms.join('r', 'c1');
    rooms.join('r', 'c2');
    rooms.join('other', 'c3');
    const receipt = rooms.broadcast('r', { payload: 'hello' });
    expect(receipt.delivered).toBe(2);
    expect(sends.get('c1')).toHaveLength(1);
    expect(sends.get('c2')).toHaveLength(1);
    expect(sends.get('c3')).toBeUndefined();
  });

  it('broadcast excludes the sender set', () => {
    rooms.join('r', 'c1');
    rooms.join('r', 'c2');
    const receipt = rooms.broadcast('r', { payload: 'x', exclude: new Set(['c1']) });
    expect(receipt.excluded).toBe(1);
    expect(receipt.delivered).toBe(1);
    expect(sends.get('c1')).toBeUndefined();
  });

  it('broadcast isolates per-member send failures', () => {
    const rm = new RoomManager((connId) => connId !== 'bad');
    rm.join('r', 'bad');
    rm.join('r', 'good');
    const receipt = rm.broadcast('r', { payload: 'x' });
    expect(receipt.failed).toBe(1);
    expect(receipt.delivered).toBe(1);
  });

  it('broadcastMany dedupes connections in multiple target rooms', () => {
    rooms.join('a', 'c1');
    rooms.join('b', 'c1');
    rooms.join('b', 'c2');
    const receipt = rooms.broadcastMany(['a', 'b'], { payload: 'x' });
    expect(receipt.delivered).toBe(2);
    expect(sends.get('c1')).toHaveLength(1);
  });

  it('leaveAll removes a connection everywhere (disconnect cleanup)', () => {
    rooms.join('a', 'c1');
    rooms.join('b', 'c1');
    rooms.join('b', 'c2');
    const left = rooms.leaveAll('c1');
    expect(left.sort()).toEqual(['a', 'b']);
    expect(rooms.memberCount('b')).toBe(1);
    expect(rooms.memberCount('a')).toBe(0);
  });

  it('enforces maxRoomSize', () => {
    const rm = new RoomManager(() => true, { maxRoomSize: 1 });
    rm.join('r', 'c1');
    expect(() => rm.join('r', 'c2')).toThrow(JoinRejectedError);
  });

  it('tracks reverse membership via roomsOf', () => {
    rooms.join('a', 'c1');
    rooms.join('b', 'c1');
    expect(rooms.roomsOf('c1').sort()).toEqual(['a', 'b']);
  });
});

/* ------------------------------------------------------------------ */
/* PresenceRegistry                                                    */
/* ------------------------------------------------------------------ */

describe('PresenceRegistry', () => {
  let clock: ReturnType<typeof manualClock>;
  let presence: PresenceRegistry;
  let events: PresenceEvent[];

  beforeEach(() => {
    clock = manualClock();
    presence = new PresenceRegistry({ now: clock.now });
    events = [];
    presence.subscribe((e) => events.push(e));
  });

  it('fires online on first connection, connection-added on second', () => {
    presence.addConnection('u1', 'c1');
    presence.addConnection('u1', 'c2');
    expect(events.map((e) => e.kind)).toEqual(['online', 'connection-added']);
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.connectionsFor('u1')).toBe(2);
  });

  it('fires offline only when the last connection leaves', () => {
    presence.addConnection('u1', 'c1');
    presence.addConnection('u1', 'c2');
    events = [];
    presence.removeConnection('c1');
    expect(events.map((e) => e.kind)).toEqual(['connection-removed']);
    expect(presence.isOnline('u1')).toBe(true);
    presence.removeConnection('c2');
    expect(events.map((e) => e.kind)).toEqual(['connection-removed', 'offline']);
    expect(presence.isOnline('u1')).toBe(false);
    expect(presence.onlineCount).toBe(0);
  });

  it('touch records activity and clears idle state', () => {
    presence.addConnection('u1', 'c1');
    clock.advance(60_000);
    const marked = presence.sweep(30_000);
    expect(marked).toEqual(['c1']);
    expect(presence.get('u1')?.state).toBe(PresenceState.IDLE);
    events = [];
    presence.touch('c1');
    expect(events.map((e) => e.kind)).toEqual(['active']);
    expect(presence.get('u1')?.state).toBe(PresenceState.ONLINE);
  });

  it('scoped subscriptions only fire for watched users', () => {
    const scoped: PresenceEvent[] = [];
    presence.subscribe((e) => scoped.push(e), ['u1']);
    presence.addConnection('u1', 'c1');
    presence.addConnection('u2', 'c2');
    expect(scoped.map((e) => e.kind)).toEqual(['online']);
  });

  it('unsubscribe stops event flow', () => {
    const sub: PresenceEvent[] = [];
    const off = presence.subscribe((e) => sub.push(e));
    presence.addConnection('u1', 'c1');
    off();
    presence.removeConnection('c1');
    expect(sub.map((e) => e.kind)).toEqual(['online']);
  });

  it('metadata changes emit events to scoped subscribers', () => {
    presence.addConnection('u1', 'c1');
    const scoped: PresenceEvent[] = [];
    presence.subscribe((e) => scoped.push(e), ['u1']);
    presence.setUserMetadata('u1', { status: 'in-meeting' });
    expect(scoped.map((e) => e.kind)).toEqual(['metadata-changed']);
    expect(presence.get('u1')?.metadata.status).toBe('in-meeting');
  });

  it('a throwing listener does not break other subscribers', () => {
    const good: PresenceEvent[] = [];
    presence.subscribe(() => {
      throw new Error('boom');
    });
    presence.subscribe((e) => good.push(e));
    presence.addConnection('u1', 'c1');
    expect(good).toHaveLength(1);
  });

  it('removeConnection returns the owning user', () => {
    presence.addConnection('u1', 'c1');
    expect(presence.removeConnection('c1')).toBe('u1');
    expect(presence.removeConnection('c1')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* UpgradeRouter                                                       */
/* ------------------------------------------------------------------ */

describe('RoutePattern', () => {
  it('matches exact paths', () => {
    const p = new RoutePattern('/ws/chat');
    expect(p.match('/ws/chat')).toEqual({});
    expect(p.match('/ws/other')).toBeNull();
  });

  it('captures :param segments', () => {
    const p = new RoutePattern('/chat/:room');
    expect(p.match('/chat/general')).toEqual({ room: 'general' });
    expect(p.match('/chat')).toBeNull();
    expect(p.match('/chat/a/b')).toBeNull();
  });

  it('supports wildcard tails', () => {
    const p = new RoutePattern('/stream/*');
    expect(p.match('/stream/a/b/c')).toEqual({ '*': 'a/b/c' });
  });

  it('ignores the query string', () => {
    const p = new RoutePattern('/chat/:room');
    expect(p.match('/chat/x?token=1')).toEqual({ room: 'x' });
  });
});

describe('UpgradeRouter', () => {
  let clock: ReturnType<typeof manualClock>;
  let router: UpgradeRouter;
  let issuer: ResumeTokenIssuer;

  beforeEach(() => {
    clock = manualClock();
    issuer = new ResumeTokenIssuer(new TestResumeTokenSigner());
    router = new UpgradeRouter({
      tokenIssuer: issuer,
      now: clock.now,
      setTimeoutFn: (fn, ms) => setTimeout(fn, ms),
      clearTimeoutFn: (h) => clearTimeout(h as NodeJS.Timeout),
    });
  });

  function accept(d: UpgradeDecision) {
    if (d.kind !== 'accept') throw new Error(`expected accept, got ${JSON.stringify(d)}`);
    return d;
  }

  it('rejects unknown paths with 404', async () => {
    router.addRoute({ pattern: new RoutePattern('/ws') });
    const d = await router.decide(handshakeFor('/other'));
    expect(d.kind).toBe('reject');
    if (d.kind === 'reject') expect(d.status).toBe(404);
  });

  it('rejects over-limit routes with 503 before handshake validation', async () => {
    router.addRoute({ pattern: new RoutePattern('/ws'), maxConnections: 1 });
    const d1 = await router.decide(handshakeFor('/ws'));
    const a = accept(d1);
    router.attach(a, () => {});
    const d2 = await router.decide(handshakeFor('/ws'));
    expect(d2.kind).toBe('reject');
    if (d2.kind === 'reject') expect(d2.status).toBe(503);
  });

  it('rejects invalid handshakes with 400', async () => {
    router.addRoute({ pattern: new RoutePattern('/ws') });
    const req = handshakeFor('/ws');
    const bad = {
      ...req,
      headers: new Map([...req.headers].filter(([k]) => k !== 'sec-websocket-key')),
    };
    const d = await router.decide(bad);
    expect(d.kind).toBe('reject');
    if (d.kind === 'reject') expect(d.status).toBe(400);
  });

  it('authorize hook can reject with 403', async () => {
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      hooks: { authorize: () => 'not allowed' },
    });
    const d = await router.decide(handshakeFor('/ws'));
    expect(d.kind).toBe('reject');
    if (d.kind === 'reject') expect(d.status).toBe(403);
  });

  it('accept produces connId, params and acceptKey', async () => {
    router.addRoute({ pattern: new RoutePattern('/chat/:room') });
    const d = accept(await router.decide(handshakeFor('/chat/lobby')));
    expect(d.params.room).toBe('lobby');
    expect(d.acceptKey.length).toBeGreaterThan(0);
    expect(d.connId.length).toBeGreaterThan(0);
  });

  it('attach creates a working session — inbound text reaches onMessage', async () => {
    const received: string[] = [];
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      hooks: { onMessage: (_c, m) => received.push(m.payload.toString()) },
    });
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, () => {});
    router.receive(conn, textFrame('hello'));
    expect(received).toEqual(['hello']);
    router.dispose();
  });

  it('outbound sends are framed and reach the transport', async () => {
    router.addRoute({ pattern: new RoutePattern('/ws') });
    const wire: Buffer[] = [];
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, (bytes) => wire.push(bytes));
    conn.send('hi there');
    const frames = new FrameCodec().feed(Buffer.concat(wire));
    expect(frames).toHaveLength(1);
    expect(frames[0].opcode).toBe(WsOpcode.TEXT);
    expect(frames[0].payload.toString()).toBe('hi there');
    router.dispose();
  });

  it('per-connection rate limit drops over-limit inbound messages', async () => {
    const received: string[] = [];
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      rateLimit: { ratePerSec: 1, capacity: 2 },
      hooks: { onMessage: (_c, m) => received.push(m.payload.toString()) },
    });
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, () => {});
    router.receive(conn, textFrame('m1'));
    router.receive(conn, textFrame('m2'));
    router.receive(conn, textFrame('m3')); // over limit
    expect(received).toEqual(['m1', 'm2']);
    router.dispose();
  });

  it('escalates to close on sustained violations', async () => {
    const wire: Buffer[] = [];
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      rateLimit: { ratePerSec: 0.001, capacity: 1, closeAt: 3 },
    });
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, (b) => wire.push(b));
    for (let i = 0; i < 5; i++) {
      router.receive(conn, textFrame(`m${i}`));
    }
    // A CLOSE frame (opcode 0x8) must appear on the wire.
    const frames = new FrameCodec().feed(Buffer.concat(wire));
    expect(frames.some((f) => f.opcode === WsOpcode.CLOSE)).toBe(true);
    router.dispose();
  });

  it('auto-joins rooms and broadcasts to members', async () => {
    const rooms = new RoomManager((connId, payload) => {
      const c = router.connection(connId);
      return c?.send(payload) ?? false;
    });
    router = new UpgradeRouter({
      rooms,
      tokenIssuer: issuer,
      now: clock.now,
      setTimeoutFn: (fn, ms) => setTimeout(fn, ms),
      clearTimeoutFn: (h) => clearTimeout(h as NodeJS.Timeout),
    });
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      hooks: { autoJoinRooms: () => ['lobby'] },
    });
    const d1 = accept(await router.decide(handshakeFor('/ws')));
    const d2 = accept(await router.decide(handshakeFor('/ws')));
    router.attach(d1, () => {});
    const wire2: Buffer[] = [];
    router.attach(d2, (b) => wire2.push(b));
    expect(rooms.memberCount('lobby')).toBe(2);
    rooms.broadcast('lobby', { payload: 'announce' });
    const frames = new FrameCodec().feed(Buffer.concat(wire2));
    expect(frames.some((f) => f.payload.toString() === 'announce')).toBe(true);
    router.dispose();
  });

  it('presence integration: identify marks user online, disconnect marks offline', async () => {
    const presence = new PresenceRegistry({ now: clock.now });
    const events: string[] = [];
    presence.subscribe((e) => events.push(e.kind));
    router = new UpgradeRouter({
      presence,
      tokenIssuer: issuer,
      now: clock.now,
      setTimeoutFn: (fn, ms) => setTimeout(fn, ms),
      clearTimeoutFn: (h) => clearTimeout(h as NodeJS.Timeout),
    });
    router.addRoute({ pattern: new RoutePattern('/ws') });
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, () => {});
    router.identify(conn, 'user-1');
    expect(presence.isOnline('user-1')).toBe(true);
    router.transportEnded(conn);
    expect(presence.isOnline('user-1')).toBe(false);
    expect(events).toEqual(['online', 'offline']);
    router.dispose();
  });

  it('resume: reconnect with a valid token replays missed messages', async () => {
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      resume: { windowMs: 60_000 },
    });
    const d1 = accept(await router.decide(handshakeFor('/ws')));
    const conn1 = router.attach(d1, () => {});
    conn1.send('live-1');
    // Connection dies — buffer retained for the resume window.
    router.transportEnded(conn1);

    // The client reconnects presenting a token for the dead connection
    // with lastSeq=0, so everything the buffer retained replays.
    const token = issuer.issue(d1.connId, 0);
    const d2 = accept(
      await router.decide(handshakeFor('/ws', { 'x-ws-resume': token }))
    );
    expect(d2.resume).not.toBeNull();
    expect(d2.resume?.plan.kind).toBe('replay');
    const wire2: Buffer[] = [];
    const conn2 = router.attach(d2, (b) => wire2.push(b));
    const replayed = router.replayResumePlan(conn2, d2);
    expect(replayed).toBe(1);
    const frames = new FrameCodec().feed(Buffer.concat(wire2));
    expect(frames[0].payload.toString()).toBe('live-1');
    router.dispose();
  });

  it('resume: tampered tokens are ignored (fresh session)', async () => {
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      resume: { windowMs: 60_000 },
    });
    const d = accept(
      await router.decide(handshakeFor('/ws', { 'x-ws-resume': 'forged' }))
    );
    expect(d.resume).toBeNull();
  });

  it('resume state expires past the window', async () => {
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      resume: { windowMs: 10_000 },
    });
    const d1 = accept(await router.decide(handshakeFor('/ws')));
    const conn1 = router.attach(d1, () => {});
    conn1.send('x');
    router.transportEnded(conn1);
    clock.advance(20_000);
    const expired = router.sweepExpiredResumeState();
    expect(expired).toBe(1);
    // Now a resume token only produces a fresh session (dead entry gone).
    const token = issuer.issue(d1.connId, 0);
    const d2 = accept(
      await router.decide(handshakeFor('/ws', { 'x-ws-resume': token }))
    );
    expect(d2.resume).toBeNull();
    router.dispose();
  });

  it('teardown on close removes live entry and calls onDisconnect', async () => {
    let disconnected: string | null = null;
    router.addRoute({
      pattern: new RoutePattern('/ws'),
      hooks: { onDisconnect: (id) => (disconnected = id) },
    });
    const d = accept(await router.decide(handshakeFor('/ws')));
    const conn = router.attach(d, () => {});
    expect(router.liveConnections).toBe(1);
    router.transportEnded(conn);
    expect(router.liveConnections).toBe(0);
    expect(disconnected).toBe(conn.connId);
    router.dispose();
  });
});
