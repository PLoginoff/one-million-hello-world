/**
 * ConnectionStateTracker
 *
 * Tracks per-source TCP connection state (SYN_RECEIVED / ESTABLISHED / etc.)
 * and flags sources with anomalous state distributions:
 *
 *  - `syn-received` count ≫ `established` count → classic SYN flood signature
 *  - `established` count per source > limit → connection exhaustion attack
 *  - `established` count global > limit → backend is saturated
 *
 * State transitions (driven by protocol field on TrafficEvent):
 *   TCP-SYN  → syn-received  (+embryonic timeout)
 *   TCP-ACK  → syn-received → established
 *   TCP-FIN  → established → closed
 *   TCP-RST  → *           → reset
 *
 * O(1) per event, O(states) per tick.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, TcpConnState, allow, verdict } from '../types/traffic';

export interface ConnectionStateConfig {
  /** Max concurrent established connections per source. Default 50. */
  maxEstablishedPerSource?: number;
  /** Max half-open (syn-received) per source. Default 20. */
  maxHalfOpenPerSource?: number;
  /** Half-open timeout in ms. Default 10_000. */
  embryonicTimeoutMs?: number;
}

interface Conn {
  srcIp: string;
  key: string;
  state: TcpConnState;
  lastTouchedAt: number;
  expiresAt: number;
}

interface SrcCounters {
  synReceived: number;
  established: number;
  closed: number;
  reset: number;
}

export class ConnectionStateTracker implements IDetector {
  readonly name = 'connection-state';

  private readonly _cfg: Required<ConnectionStateConfig>;
  private readonly _conns: Map<string, Conn>;
  private readonly _bySrc: Map<string, SrcCounters>;

  constructor(config: ConnectionStateConfig = {}) {
    this._cfg = {
      maxEstablishedPerSource: config.maxEstablishedPerSource ?? 50,
      maxHalfOpenPerSource: config.maxHalfOpenPerSource ?? 20,
      embryonicTimeoutMs: config.embryonicTimeoutMs ?? 10_000,
    };
    this._conns = new Map();
    this._bySrc = new Map();
  }

  inspect(event: TrafficEvent): DetectionResult {
    const key = `${event.srcIp}:${event.srcPort ?? 0}`;
    const proto = event.protocol.toUpperCase();

    const prev = this._conns.get(key);
    const counters = this._countersFor(event.srcIp);

    if (prev) {
      // Transition out of previous state.
      if (prev.state === 'syn-received') counters.synReceived--;
      if (prev.state === 'established') counters.established--;
    }

    let state: TcpConnState | null = null;
    if (proto === 'TCP-SYN') {
      state = 'syn-received';
      counters.synReceived++;
    } else if (proto === 'TCP-ACK') {
      state = 'established';
      counters.established++;
    } else if (proto === 'TCP-FIN') {
      state = 'closed';
      counters.closed++;
    } else if (proto === 'TCP-RST') {
      state = 'reset';
      counters.reset++;
    }

    if (state) {
      this._conns.set(key, {
        srcIp: event.srcIp,
        key,
        state,
        lastTouchedAt: event.at,
        expiresAt:
          state === 'syn-received' ? event.at + this._cfg.embryonicTimeoutMs : Number.POSITIVE_INFINITY,
      });
    } else {
      this._conns.delete(key);
    }

    // Verdict: flag per-source saturation or SYN skew.
    const reasons: string[] = [];
    let score = 0;
    if (counters.synReceived > this._cfg.maxHalfOpenPerSource) {
      reasons.push(`src-half-open:${counters.synReceived}`);
      score = Math.max(score, 0.85);
    }
    if (counters.established > this._cfg.maxEstablishedPerSource) {
      reasons.push(`src-established:${counters.established}`);
      score = Math.max(score, 0.7);
    }
    if (score > 0) {
      return verdict('block', score, reasons, { ...counters });
    }
    return allow();
  }

  /** Reap expired half-open connections. Returns count removed. */
  tick(now: number = Date.now()): number {
    let reaped = 0;
    for (const [k, c] of Array.from(this._conns.entries())) {
      if (c.expiresAt <= now) {
        this._conns.delete(k);
        const counters = this._bySrc.get(c.srcIp);
        if (counters && c.state === 'syn-received') {
          counters.synReceived = Math.max(0, counters.synReceived - 1);
        }
        reaped++;
      }
    }
    return reaped;
  }

  reset(): void {
    this._conns.clear();
    this._bySrc.clear();
  }

  /** Per-source snapshot. */
  countersFor(srcIp: string): Readonly<SrcCounters> | undefined {
    const c = this._bySrc.get(srcIp);
    return c ? { ...c } : undefined;
  }

  /** Global state distribution. */
  totals(): Record<TcpConnState, number> {
    const out: Record<TcpConnState, number> = {
      'syn-received': 0,
      established: 0,
      closed: 0,
      reset: 0,
    };
    for (const c of this._conns.values()) {
      out[c.state] += 1;
    }
    return out;
  }

  private _countersFor(ip: string): SrcCounters {
    let c = this._bySrc.get(ip);
    if (!c) {
      c = { synReceived: 0, established: 0, closed: 0, reset: 0 };
      this._bySrc.set(ip, c);
    }
    return c;
  }
}
