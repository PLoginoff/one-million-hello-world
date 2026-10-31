/**
 * SocketOptions — TCP socket-option negotiation model.
 *
 * Real `setsockopt(2)` calls mutate kernel state invisible to this
 * process-level simulation; what *is* worth modeling is the
 * negotiation that happens *above* the socket: the feature flags two
 * endpoints must agree on before a session is efficient, and what the
 * effective behavior is once they do.
 *
 * Modeled options (flag semantics, TCP_NODELAY equivalents):
 *
 *   TCP_NODELAY    — disable Nagle coalescing; small writes go out
 *                    immediately at the cost of more packets. When OFF,
 *                    small segments are held hoping to coalesce with a
 *                    delayed-ACK window.
 *   KEEPALIVE      — idle probes to detect half-open peers; interval/
 *                    probes/idle-time triple.
 *   LINGER         — close() behavior: 0 = RST now (abort), N = wait
 *                    up to N sec for queued data to flush then RST,
 *                    off = graceful background drain.
 *   RCVBUF/SNDBUF  — advertised/committed buffer sizes; the sender's
 *                    effective window = min(peer rcvbuf, own cwnd).
 *   REUSE_ADDR     — bind to a port in TIME_WAIT.
 *   OOB_INLINE     — urgent data delivered in-band.
 *   MSS            — max segment size clamp (PMTU floor 536).
 *   DELAYED_ACK    — peer-side ack policy: affects how Nagle interacts.
 *
 * `SocketOptionProfile` is what one endpoint *wants*; `negotiate()`
 * produces the `EffectiveSocketOptions` two endpoints actually run
 * with — mostly min/intersection semantics (buffers, MSS), AND for
 * correctness flags (a connection is only "nagle-free" if BOTH sides
 * disable it — one Nagle sender still coalesces its half of the flow).
 *
 * `SndBufGovernor` is the behavioral half: given negotiated options it
 * computes, per write, whether the bytes go out now or are coalesced —
 * the observable consequence of NODELAY on/off + delayed-ack.
 *
 * Complexity: negotiation O(options), per-write decision O(1).
 *
 * @module NetworkLayer/Engine
 */

import { EngineClock, SystemEngineClock } from './types';

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

/** One endpoint's desired settings. `undefined` = OS default. */
export interface SocketOptionProfile {
  /** Disable Nagle coalescing (send small segments immediately). */
  readonly tcpNoDelay?: boolean;
  /** Idle-probe liveness; times in seconds. */
  readonly keepAlive?: {
    readonly enabled: boolean;
    readonly idleSec?: number;
    readonly intervalSec?: number;
    readonly probes?: number;
  };
  /** close() behavior: abort-after-seconds, undefined = graceful. */
  readonly lingerSec?: number;
  readonly rcvBufBytes?: number;
  readonly sndBufBytes?: number;
  readonly reuseAddr?: boolean;
  readonly oobInline?: boolean;
  /** Max segment size clamp (bytes). */
  readonly mssBytes?: number;
  /** Delayed-ack timer in ms (0 disables delayed acks). */
  readonly delayedAckMs?: number;
}

/** What the connection actually runs with after negotiation. */
export interface EffectiveSocketOptions {
  readonly tcpNoDelay: boolean;
  readonly keepAlive: {
    readonly enabled: boolean;
    readonly idleSec: number;
    readonly intervalSec: number;
    readonly probes: number;
  };
  readonly lingerSec: number | undefined;
  readonly rcvBufBytes: number;
  readonly sndBufBytes: number;
  readonly reuseAddr: boolean;
  readonly oobInline: boolean;
  readonly mssBytes: number;
  readonly delayedAckMs: number;
  /** Effective per-direction flow window = min(rcvbuf_peer, sndbuf_self). */
  readonly sendWindowBytes: number;
}

/** Platform defaults applied where a profile is silent. */
export const SOCKET_DEFAULTS: Required<
  Pick<
    EffectiveSocketOptions,
    'rcvBufBytes' | 'sndBufBytes' | 'mssBytes' | 'delayedAckMs'
  >
> = {
  rcvBufBytes: 128 * 1024,
  sndBufBytes: 64 * 1024,
  mssBytes: 1460,
  delayedAckMs: 40,
};

/** MSS hard floor — IPv4 minimum reassembly buffer minus headers. */
export const MSS_FLOOR = 536;
export const MSS_CEILING = 65535 - 40;

/**
 * Negotiate the effective options between a client and server profile.
 *
 * Per-option rules:
 *  - tcpNoDelay: AND — Nagle off only if *both* sides ask; either
 *    side's Nagle still coalesces its outbound half of the flow.
 *  - keepAlive:   enabled if either side wants it; parameters are the
 *    *most aggressive* of the two proposals (smallest idle/interval,
 *    fewest probes) — liveness detection is fail-safe toward probing.
 *  - lingerSec:   either side's explicit abort wins; min of the two.
 *  - buffers:     effective window per direction = min(receiver's
 *    rcvBuf, sender's sndBuf); the two directions are independent.
 *    `sendWindowBytes` here is the client→server direction.
 *  - mss:         min of the two clamps, floored at MSS_FLOOR.
 *  - delayedAck:  max of the two timers (a slower ack policy dominates —
 *    the receiver's timer is what the sender waits on).
 *  - reuseAddr / oobInline: per-socket, no negotiation — the *server's*
 *    profile decides (it owns the listening socket).
 */
export function negotiateSocketOptions(
  client: SocketOptionProfile,
  server: SocketOptionProfile
): EffectiveSocketOptions {
  const ka = client.keepAlive ?? server.keepAlive;
  const otherKa = client.keepAlive && server.keepAlive ? server.keepAlive : undefined;
  const keepAlive = {
    enabled: ka?.enabled ?? false,
    idleSec: minUndef(ka?.idleSec, otherKa?.idleSec) ?? 7200,
    intervalSec: minUndef(ka?.intervalSec, otherKa?.intervalSec) ?? 75,
    probes: minUndef(ka?.probes, otherKa?.probes) ?? 9,
  };

  const rcv = server.rcvBufBytes ?? SOCKET_DEFAULTS.rcvBufBytes;
  const snd = client.sndBufBytes ?? SOCKET_DEFAULTS.sndBufBytes;

  return {
    tcpNoDelay: (client.tcpNoDelay ?? false) && (server.tcpNoDelay ?? false),
    keepAlive,
    lingerSec: minUndef(client.lingerSec, server.lingerSec),
    rcvBufBytes: rcv,
    sndBufBytes: snd,
    reuseAddr: server.reuseAddr ?? false,
    oobInline: server.oobInline ?? false,
    mssBytes: Math.max(
      MSS_FLOOR,
      Math.min(
        client.mssBytes ?? SOCKET_DEFAULTS.mssBytes,
        server.mssBytes ?? SOCKET_DEFAULTS.mssBytes,
        MSS_CEILING
      )
    ),
    delayedAckMs: Math.max(
      client.delayedAckMs ?? SOCKET_DEFAULTS.delayedAckMs,
      server.delayedAckMs ?? SOCKET_DEFAULTS.delayedAckMs
    ),
    sendWindowBytes: Math.min(rcv, snd),
  };
}

function minUndef(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/* ------------------------------------------------------------------ */
/* Nagle/delayed-ack behavioral model                                  */
/* ------------------------------------------------------------------ */

export const enum WriteDisposition {
  /** Sent now. */
  SENT = 'sent',
  /** Held by Nagle awaiting a full MSS or the delayed-ack release. */
  COALESCED = 'coalesced',
  /** Held data released because the ack window elapsed or filled. */
  FLUSHED = 'flushed',
}

export interface WriteOutcome {
  readonly disposition: WriteDisposition;
  /** Bytes that hit the wire during this call (sent or flushed+sent). */
  readonly emittedBytes: number;
  /** Bytes still buffered awaiting coalescing. */
  readonly pendingBytes: number;
}

/**
 * Simulates what the sender's stack does with a stream of writes under
 * negotiated options.
 *
 * Nagle: with NODELAY off, a sub-MSS write while any un-acked data is
 * in flight is *held* (coalesced into the next segment). It's released
 * when (a) buffered data reaches MSS, or (b) the delayed-ack window
 * passes and the peer's ack arrives — modeled as `ack()` / clock.
 *
 * With NODELAY on, everything emits immediately.
 */
export class SndBufGovernor {
  private readonly _opts: EffectiveSocketOptions;
  private readonly _clock: EngineClock;
  private _pending = 0;
  private _unacked = 0;
  private _lastWriteAt = 0;

  constructor(opts: EffectiveSocketOptions, clock: EngineClock = new SystemEngineClock()) {
    this._opts = opts;
    this._clock = clock;
  }

  /** A write hits the sender's stack. */
  write(bytes: number): WriteOutcome {
    this._lastWriteAt = this._clock.now();
    if (this._opts.tcpNoDelay) {
      const emitted = bytes + this._pending;
      this._pending = 0;
      this._unacked += emitted;
      return { disposition: WriteDisposition.SENT, emittedBytes: emitted, pendingBytes: 0 };
    }
    this._pending += bytes;
    // Full segment buffered → flush regardless of unacked state.
    if (this._pending >= this._opts.mssBytes) {
      const emitted = this._pending;
      this._pending = 0;
      this._unacked += emitted;
      return { disposition: WriteDisposition.FLUSHED, emittedBytes: emitted, pendingBytes: 0 };
    }
    // Nothing in flight → small write goes anyway (Nagle only holds
    // when unacked data exists).
    if (this._unacked === 0) {
      const emitted = this._pending;
      this._pending = 0;
      this._unacked += emitted;
      return { disposition: WriteDisposition.SENT, emittedBytes: emitted, pendingBytes: 0 };
    }
    return { disposition: WriteDisposition.COALESCED, emittedBytes: 0, pendingBytes: this._pending };
  }

  /**
   * The peer's ack lands — releases anything Nagle held. `ackedBytes`
   * clears unacked debt first.
   */
  ack(ackedBytes: number): WriteOutcome {
    this._unacked = Math.max(0, this._unacked - ackedBytes);
    if (this._pending > 0 && this._unacked === 0) {
      const emitted = this._pending;
      this._pending = 0;
      this._unacked += emitted;
      return { disposition: WriteDisposition.FLUSHED, emittedBytes: emitted, pendingBytes: 0 };
    }
    return { disposition: WriteDisposition.SENT, emittedBytes: 0, pendingBytes: this._pending };
  }

  /** Delayed-ack timeout fired — same release as an ack. */
  tick(): WriteOutcome {
    const now = this._clock.now();
    if (this._pending > 0 && now - this._lastWriteAt >= this._opts.delayedAckMs) {
      const emitted = this._pending;
      this._pending = 0;
      this._unacked += emitted;
      return { disposition: WriteDisposition.FLUSHED, emittedBytes: emitted, pendingBytes: 0 };
    }
    return { disposition: WriteDisposition.SENT, emittedBytes: 0, pendingBytes: this._pending };
  }

  get pendingBytes(): number {
    return this._pending;
  }

  get unackedBytes(): number {
    return this._unacked;
  }
}
