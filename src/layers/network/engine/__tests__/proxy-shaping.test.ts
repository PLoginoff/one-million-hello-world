/**
 * Proxy protocol, socket options, traffic shaping — unit tests.
 *
 * Everything is deterministic: handshakes are fed byte arrays
 * chunk-by-chunk, token buckets run on ManualEngineClock.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ConnectClientHandshake,
  ConnectServerHandshake,
  ConnectionShaper,
  encodeAscii,
  ManualEngineClock,
  negotiateSocketOptions,
  NetnsRegistry,
  ProxyPhase,
  SndBufGovernor,
  Socks5AddrType,
  Socks5Cmd,
  Socks5Method,
  Socks5ServerHandshake,
  Socks5State,
  socks5ConnectFrame,
  socks5Greeting,
  TokenBucket,
  TrafficShaper,
  WriteDisposition,
  parseAuthority,
} from '../index';
import type { SocketOptionProfile } from '../index';

/* ------------------------------------------------------------------ */
/* HTTP CONNECT                                                        */
/* ------------------------------------------------------------------ */

describe('ConnectServerHandshake', () => {
  it('parses a full CONNECT request and opens the tunnel', () => {
    const s = new ConnectServerHandshake();
    const req = encodeAscii('CONNECT api.example.com:443 HTTP/1.1\r\nHost: api.example.com:443\r\n\r\n');
    const r = s.feed(req);
    expect(r.phase).toBe(ProxyPhase.TUNNEL);
    expect(r.target?.host).toBe('api.example.com');
    expect(r.target?.port).toBe(443);
    const reply = new TextDecoder().decode(r.replies[0]);
    expect(reply).toContain('200');
  });

  it('handles a request split across arbitrary chunk boundaries', () => {
    const s = new ConnectServerHandshake();
    const req = encodeAscii('CONNECT h:80 HTTP/1.1\r\n\r\n');
    // Feed byte-by-byte — the parser must buffer.
    let result = s.feed(req.subarray(0, 1));
    expect(result.phase).toBe(ProxyPhase.NEGOTIATING);
    for (let i = 1; i < req.length; i++) {
      result = s.feed(req.subarray(i, i + 1));
    }
    expect(result.phase).toBe(ProxyPhase.TUNNEL);
    expect(result.target?.host).toBe('h');
  });

  it('passes post-header bytes through as tunnel data', () => {
    const s = new ConnectServerHandshake();
    const req = encodeAscii('CONNECT h:443 HTTP/1.1\r\n\r\nGET / HTTP/1.1');
    const r = s.feed(req);
    expect(r.phase).toBe(ProxyPhase.TUNNEL);
    expect(r.tunnelBytes).toBeDefined();
    expect(new TextDecoder().decode(r.tunnelBytes)).toBe('GET / HTTP/1.1');
  });

  it('rejects non-CONNECT methods', () => {
    const s = new ConnectServerHandshake();
    const r = s.feed(encodeAscii('GET / HTTP/1.1\r\n\r\n'));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.error).toBe('not-connect');
    expect(new TextDecoder().decode(r.replies[0])).toContain('405');
  });

  it('rejects oversized header blocks', () => {
    const s = new ConnectServerHandshake({ maxHeaderBytes: 64 });
    const big = encodeAscii(`CONNECT h:443 HTTP/1.1\r\nX-Pad: ${'x'.repeat(200)}\r\n\r\n`);
    const r = s.feed(big);
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.error).toBe('header-block-too-large');
  });

  it('enforces allowed-ports policy', () => {
    const s = new ConnectServerHandshake({ allowedPorts: [443] });
    const r = s.feed(encodeAscii('CONNECT h:22 HTTP/1.1\r\n\r\n'));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.error).toBe('port-not-allowed');
    expect(new TextDecoder().decode(r.replies[0])).toContain('403');
  });

  it('parses IPv6 authority', () => {
    expect(parseAuthority('[::1]:8443')).toEqual({ host: '::1', port: 8443 });
    expect(parseAuthority('host:80')).toEqual({ host: 'host', port: 80 });
    expect(parseAuthority('no-port')).toBeNull();
    expect(parseAuthority('h:99999')).toBeNull();
  });
});

describe('ConnectClientHandshake', () => {
  it('drives a full round-trip against the server', () => {
    const client = new ConnectClientHandshake({ host: 'svc.local', port: 8080 });
    const server = new ConnectServerHandshake();
    const serverResult = server.feed(client.request());
    expect(serverResult.phase).toBe(ProxyPhase.TUNNEL);
    const clientResult = client.feed(serverResult.replies[0]);
    expect(clientResult.phase).toBe(ProxyPhase.TUNNEL);
    expect(clientResult.target?.host).toBe('svc.local');
  });

  it('treats a 407 as failure', () => {
    const client = new ConnectClientHandshake({ host: 'h', port: 443 });
    const r = client.feed(encodeAscii('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.error).toBe('status-407');
  });
});

/* ------------------------------------------------------------------ */
/* SOCKS5                                                              */
/* ------------------------------------------------------------------ */

describe('Socks5ServerHandshake', () => {
  it('completes no-auth greeting + CONNECT for a domain target', () => {
    const s = new Socks5ServerHandshake();
    let r = s.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    expect(r.replies[0]).toEqual(new Uint8Array([0x05, 0x00]));
    expect(s.state).toBe(Socks5State.REQUEST);

    r = s.feed(socks5ConnectFrame({ host: 'example.com', port: 443 }));
    expect(r.phase).toBe(ProxyPhase.TUNNEL);
    expect(r.target).toEqual({ host: 'example.com', port: 443 });
    expect(r.replies[0][1]).toBe(0x00); // REP granted
  });

  it('handles the whole handshake in one coalesced datagram', () => {
    const s = new Socks5ServerHandshake();
    // Real clients pipeline: greeting+request in one write.
    const greeting = s.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    expect(greeting.phase).toBe(ProxyPhase.NEGOTIATING);
    // (SOCKS5 is lockstep — client must wait for method reply; a real
    // pipeliner risks a NO_ACCEPTABLE. So feed sequentially.)
  });

  it('rejects an unacceptable method set', () => {
    const s = new Socks5ServerHandshake({ methods: [Socks5Method.USER_PASS] });
    const r = s.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.replies[0][1]).toBe(0xff);
  });

  it('runs RFC 1929 user/pass auth when negotiated', () => {
    const s = new Socks5ServerHandshake({
      methods: [Socks5Method.USER_PASS],
      authenticate: (u, p) => u === 'alice' && p === 's3cret',
    });
    s.feed(socks5Greeting([Socks5Method.USER_PASS]));
    expect(s.state).toBe(Socks5State.AUTH);
    // [VER=1 ULEN=5 "alice" PLEN=6 "s3cret"]
    const authMsg = new Uint8Array([0x01, 5, ...encodeAscii('alice'), 6, ...encodeAscii('s3cret')]);
    const r = s.feed(authMsg);
    expect(r.replies[0]).toEqual(new Uint8Array([0x01, 0x00]));
    expect(s.state).toBe(Socks5State.REQUEST);
  });

  it('fails bad credentials', () => {
    const s = new Socks5ServerHandshake({
      methods: [Socks5Method.USER_PASS],
      authenticate: () => false,
    });
    s.feed(socks5Greeting([Socks5Method.USER_PASS]));
    const r = s.feed(new Uint8Array([0x01, 1, ...encodeAscii('x'), 1, ...encodeAscii('y')]));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.replies[0][1]).toBe(0x01);
  });

  it('parses IPv4 and IPv6 targets', () => {
    const s4 = new Socks5ServerHandshake();
    s4.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    const r4 = s4.feed(socks5ConnectFrame({ host: '10.0.0.1', port: 22 }));
    expect(r4.target).toEqual({ host: '10.0.0.1', port: 22 });

    const s6 = new Socks5ServerHandshake();
    s6.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    const v6 = new Uint8Array([
      0x05, Socks5Cmd.CONNECT, 0x00, Socks5AddrType.IPV6,
      ...new Array(15).fill(0), 1, // ::1
      0x1f, 0x90, // port 8080
    ]);
    const r6 = s6.feed(v6);
    expect(r6.target?.host).toBe('0:0:0:0:0:0:0:1');
    expect(r6.target?.port).toBe(8080);
  });

  it('rejects unsupported commands and atyps', () => {
    const s = new Socks5ServerHandshake();
    s.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    const bind = new Uint8Array([0x05, Socks5Cmd.BIND, 0x00, Socks5AddrType.IPV4, 1, 2, 3, 4, 0, 80]);
    const r = s.feed(bind);
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.replies[0][1]).toBe(0x07); // CMD_UNSUPPORTED

    const s2 = new Socks5ServerHandshake();
    s2.feed(socks5Greeting([Socks5Method.NO_AUTH]));
    const badAtyp = new Uint8Array([0x05, Socks5Cmd.CONNECT, 0x00, 0x09, 0, 0]);
    const r2 = s2.feed(badAtyp);
    expect(r2.replies[0][1]).toBe(0x08); // ATYP_UNSUPPORTED
  });

  it('rejects wrong version', () => {
    const s = new Socks5ServerHandshake();
    const r = s.feed(new Uint8Array([0x04, 1, Socks5Method.NO_AUTH]));
    expect(r.phase).toBe(ProxyPhase.FAILED);
    expect(r.error).toBe('bad-version');
  });
});

/* ------------------------------------------------------------------ */
/* Socket options negotiation                                          */
/* ------------------------------------------------------------------ */

describe('negotiateSocketOptions', () => {
  it('tcpNoDelay requires both sides (AND semantics)', () => {
    const on = negotiateSocketOptions({ tcpNoDelay: true }, { tcpNoDelay: true });
    expect(on.tcpNoDelay).toBe(true);
    const half = negotiateSocketOptions({ tcpNoDelay: true }, { tcpNoDelay: false });
    expect(half.tcpNoDelay).toBe(false);
  });

  it('send window = min(server rcvbuf, client sndbuf)', () => {
    const o = negotiateSocketOptions(
      { sndBufBytes: 32 * 1024 },
      { rcvBufBytes: 16 * 1024 }
    );
    expect(o.sendWindowBytes).toBe(16 * 1024);
  });

  it('mss clamps to the smaller proposal, floored', () => {
    const o = negotiateSocketOptions({ mssBytes: 1200 }, { mssBytes: 9000 });
    expect(o.mssBytes).toBe(1200);
    const floor = negotiateSocketOptions({ mssBytes: 100 }, {});
    expect(floor.mssBytes).toBe(536);
  });

  it('keepalive picks most aggressive parameters', () => {
    const o = negotiateSocketOptions(
      { keepAlive: { enabled: true, idleSec: 30, probes: 3 } },
      { keepAlive: { enabled: true, idleSec: 60, probes: 5 } }
    );
    expect(o.keepAlive.enabled).toBe(true);
    expect(o.keepAlive.idleSec).toBe(30);
    expect(o.keepAlive.probes).toBe(3);
  });

  it('linger takes the minimum defined value', () => {
    const o = negotiateSocketOptions({ lingerSec: 5 }, { lingerSec: 0 });
    expect(o.lingerSec).toBe(0);
    const o2 = negotiateSocketOptions({ lingerSec: 5 }, {});
    expect(o2.lingerSec).toBe(5);
  });

  it('server profile owns reuseAddr/oobInline', () => {
    const o = negotiateSocketOptions({ reuseAddr: true, oobInline: true }, { reuseAddr: false });
    expect(o.reuseAddr).toBe(false);
  });
});

describe('SndBufGovernor (Nagle model)', () => {
  let clock: ManualEngineClock;
  const opts = negotiateSocketOptions({ tcpNoDelay: false }, { tcpNoDelay: false });

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('first small write sends; second coalesces while unacked', () => {
    const g = new SndBufGovernor(opts, clock);
    const w1 = g.write(100);
    expect(w1.disposition).toBe(WriteDisposition.SENT);
    const w2 = g.write(100);
    expect(w2.disposition).toBe(WriteDisposition.COALESCED);
    expect(w2.pendingBytes).toBe(100);
    // Ack arrives → pending flushes.
    const a = g.ack(100);
    expect(a.disposition).toBe(WriteDisposition.FLUSHED);
    expect(a.emittedBytes).toBe(100);
  });

  it('accumulated bytes flush at MSS boundary', () => {
    const g = new SndBufGovernor(opts, clock);
    g.write(100); // sent (nothing unacked)
    let out = g.write(800); // coalesced (unacked=100)
    expect(out.disposition).toBe(WriteDisposition.COALESCED);
    out = g.write(800); // pending now 1600 ≥ MSS 1460 → flush
    expect(out.disposition).toBe(WriteDisposition.FLUSHED);
    expect(out.emittedBytes).toBe(1600);
  });

  it('delayed-ack tick releases pending data', () => {
    const g = new SndBufGovernor(opts, clock);
    g.write(100); // sent
    g.write(50);  // coalesced
    clock.advance(30); // < delayedAckMs (40 default ×2 sides... = 40)
    expect(g.tick().disposition).toBe(WriteDisposition.SENT);
    clock.advance(20); // 50ms elapsed > 40ms
    const t = g.tick();
    expect(t.disposition).toBe(WriteDisposition.FLUSHED);
    expect(t.emittedBytes).toBe(50);
  });

  it('tcpNoDelay sends everything immediately', () => {
    const nd = negotiateSocketOptions({ tcpNoDelay: true }, { tcpNoDelay: true });
    const g = new SndBufGovernor(nd, clock);
    g.write(100);
    const w = g.write(50);
    expect(w.disposition).toBe(WriteDisposition.SENT);
    expect(w.pendingBytes).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Token bucket + shaping                                              */
/* ------------------------------------------------------------------ */

describe('TokenBucket', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('starts full; denies past capacity until refill', () => {
    const b = new TokenBucket({ ratePerSec: 1000, capacity: 100, clock });
    expect(b.permit(100).allowed).toBe(true);
    const d = b.permit(1);
    expect(d.allowed).toBe(false);
    expect(d.waitMs).toBeCloseTo(1, 1); // 1 token at 1000/s = 1ms
    clock.advance(10);
    expect(b.permit(1).allowed).toBe(true);
  });

  it('sustained rate converges to ratePerSec (long-run bound)', () => {
    const b = new TokenBucket({ ratePerSec: 100, capacity: 10, clock });
    let allowed = 0;
    // Greedy drain: ask for far more than the rate every step; count
    // what actually passes over 10 simulated seconds.
    for (let t = 0; t < 200; t++) {
      if (b.permit(1).allowed) allowed++;
      if (b.permit(5).allowed) allowed += 5;
      clock.advance(50);
    }
    // ~1000 expected (100/s × 10s) + initial 10-token burst.
    expect(allowed).toBeGreaterThan(950);
    expect(allowed).toBeLessThan(1150);
  });

  it('a denied call spends nothing (no debt)', () => {
    const b = new TokenBucket({ ratePerSec: 100, capacity: 10, clock });
    b.permit(10); // drain
    expect(b.permit(5).allowed).toBe(false); // denied, 0 spent
    clock.advance(20); // accrue 2 tokens
    expect(b.permit(5).allowed).toBe(false); // still short
    clock.advance(30); // +3 → 5 total
    expect(b.permit(5).allowed).toBe(true);
  });

  it('burst is capped at capacity', () => {
    const b = new TokenBucket({ ratePerSec: 1, capacity: 50, clock });
    let burst = 0;
    while (b.permit(1).allowed) burst++;
    expect(burst).toBe(50);
  });
});

describe('ConnectionShaper', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('read and write shape independently', () => {
    const s = new ConnectionShaper(
      { readBytesPerSec: 100, writeBytesPerSec: 10 },
      clock,
      null
    );
    expect(s.permitRead(50).allowed).toBe(true);
    expect(s.permitWrite(50).allowed).toBe(false);
    expect(s.permitWrite(50).deniedBy).toBe('write');
  });

  it('maxChunkBytes denies oversized permits outright', () => {
    const s = new ConnectionShaper(
      { writeBytesPerSec: 1000, maxChunkBytes: 100 },
      clock,
      null
    );
    const r = s.permitWrite(500);
    expect(r.allowed).toBe(false);
    expect(r.deniedBy).toBe('chunk');
  });

  it('shared link bucket contends across connections', () => {
    const shaper = new TrafficShaper({ linkBytesPerSec: 100, clock });
    const a = shaper.for('a', { writeBytesPerSec: 1000 });
    const b = shaper.for('b', { writeBytesPerSec: 1000 });
    expect(a.permitWrite(80).allowed).toBe(true);  // link: 100→20
    const r = b.permitWrite(50);
    expect(r.allowed).toBe(false);
    expect(r.deniedBy).toBe('link');
  });
});

/* ------------------------------------------------------------------ */
/* Network namespaces                                                  */
/* ------------------------------------------------------------------ */

describe('NetnsRegistry', () => {
  let clock: ManualEngineClock;
  let reg: NetnsRegistry;

  beforeEach(() => {
    clock = new ManualEngineClock();
    reg = new NetnsRegistry(clock);
  });

  it('namespaces are isolated without a veth pair', () => {
    reg.ns('red');
    reg.ns('blue');
    const r = reg.route('red', 'blue');
    expect(r.reachable).toBe(false);
    expect(r.deniedBy).toBe('no-link');
  });

  it('a veth pair joins two namespaces', () => {
    reg.link('red', 'veth0', 'blue', 'veth0');
    const r = reg.route('red', 'blue');
    expect(r.reachable).toBe(true);
    expect(r.path).toEqual(['red', 'blue']);
  });

  it('routes transit through intermediate namespaces (BFS)', () => {
    reg.link('a', 'v0', 'b', 'v0');
    reg.link('b', 'v1', 'c', 'v1');
    const r = reg.route('a', 'c');
    expect(r.reachable).toBe(true);
    expect(r.path).toEqual(['a', 'b', 'c']);
  });

  it('picks shortest path among alternatives', () => {
    reg.link('s', 'v0', 'x1', 'v0');
    reg.link('x1', 'v1', 'x2', 'v1');
    reg.link('x2', 'v2', 'd', 'v2');
    reg.link('s', 'v9', 'd', 'v9'); // direct
    const r = reg.route('s', 'd');
    expect(r.path.length).toBe(2);
  });

  it('rate-capped links deny over-budget traffic', () => {
    reg.link('a', 'v0', 'b', 'v0', 100); // 100 B/s
    expect(reg.route('a', 'b', 50).reachable).toBe(true);
    const r = reg.route('a', 'b', 60); // exceeds remaining burst
    expect(r.reachable).toBe(false);
    expect(r.deniedBy).toBe('rate');
    clock.advance(1000);
    expect(reg.route('a', 'b', 60).reachable).toBe(true);
  });

  it('unlink removes connectivity', () => {
    reg.link('a', 'v0', 'b', 'v0');
    reg.unlink('a', 'v0', 'b', 'v0');
    expect(reg.route('a', 'b').reachable).toBe(false);
  });

  it('same-namespace route is trivially reachable', () => {
    reg.ns('self');
    expect(reg.route('self', 'self').reachable).toBe(true);
  });
});
