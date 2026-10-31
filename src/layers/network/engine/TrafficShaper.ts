/**
 * TrafficShaper — token-bucket bandwidth limits per connection, plus
 * network-namespace simulation.
 *
 * Token bucket: the standard shape for rate limiting because it's the
 * *only* scheme that allows controlled bursts while still bounding
 * long-run rate:
 *
 *   bucket capacity B, refill R tokens/sec
 *   consume(n): if tokens >= n → spend, allow
 *               else → deny/delay by (n - tokens)/R seconds
 *
 * Long-run rate ≤ R; instantaneous burst ≤ B. Nothing else gets both.
 * (`leaky bucket` bounds rate but forbids bursts; a fixed window has
 * the 2×-boundary problem.)
 *
 * `TokenBucket` is the primitive — one bucket, clock-driven refill.
 * `ConnectionShaper` applies one read-bucket + one write-bucket to a
 * connection id, returning `permit(n)` → `{allowed, waitMs}` so a
 * pipeline can either drop or schedule the write.
 * `TrafficShaper` is the registry: per-connection buckets created
 * lazily from a template policy, plus a shared "link" bucket that caps
 * aggregate bandwidth (connections contend on the same physical pipe).
 *
 * `NetworkNamespace` simulates Linux-style netns isolation: a registry
 * of veth pairs, routes, and per-namespace shaper policies. Two
 * namespaces can't see each other's connections unless a veth pair
 * joins them — the point of a namespace boundary is isolation, and the
 * test-observable consequence is `route(srcNs, dstNs)` failing.
 *
 * Complexity: permit O(1); namespace route O(adjacent links).
 *
 * @module NetworkLayer/Engine
 */

import { EngineClock, SystemEngineClock } from './types';

/* ------------------------------------------------------------------ */
/* Token bucket                                                        */
/* ------------------------------------------------------------------ */

export interface TokenBucketOptions {
  /** Tokens added per second — the sustained rate. */
  readonly ratePerSec: number;
  /**
   * Max tokens the bucket holds — the burst bound. A bucket that can't
   * hold one `permit(n)` call's worth of tokens can never pass that
   * call (guard: capacity >= largest expected n, or callers chunk).
   */
  readonly capacity: number;
  /** Start full (default) or empty. */
  readonly startFull?: boolean;
  readonly clock?: EngineClock;
}

export interface Permit {
  readonly allowed: boolean;
  /** Tokens remaining after the decision. */
  readonly tokensLeft: number;
  /**
   * Ms until the denied amount *would* be available. Always the
   * wait-time answer even for allowed calls (0 when allowed) — a
   * scheduler can use it uniformly.
   */
  readonly waitMs: number;
}

export class TokenBucket {
  private readonly _ratePerSec: number;
  private readonly _capacity: number;
  private readonly _clock: EngineClock;
  private _tokens: number;
  private _lastRefillAt: number;

  constructor(opts: TokenBucketOptions) {
    if (opts.ratePerSec <= 0) throw new Error('ratePerSec must be > 0');
    if (opts.capacity <= 0) throw new Error('capacity must be > 0');
    this._ratePerSec = opts.ratePerSec;
    this._capacity = opts.capacity;
    this._clock = opts.clock ?? new SystemEngineClock();
    this._tokens = (opts.startFull ?? true) ? opts.capacity : 0;
    this._lastRefillAt = this._clock.now();
  }

  /** Lazy refill: tokens accrue at rate, capped at capacity. */
  private _refill(): void {
    const now = this._clock.now();
    const elapsedSec = (now - this._lastRefillAt) / 1000;
    if (elapsedSec <= 0) return;
    this._tokens = Math.min(this._capacity, this._tokens + elapsedSec * this._ratePerSec);
    this._lastRefillAt = now;
  }

  /**
   * Attempt to spend `n` tokens. Success spends and returns allowed;
   * failure spends nothing — a denied call doesn't borrow against the
   * future (that's what makes waitMs a schedule, not a debt).
   */
  permit(n: number): Permit {
    this._refill();
    if (n <= this._tokens) {
      this._tokens -= n;
      return { allowed: true, tokensLeft: this._tokens, waitMs: 0 };
    }
    const deficit = n - this._tokens;
    const waitMs = (deficit / this._ratePerSec) * 1000;
    return { allowed: false, tokensLeft: this._tokens, waitMs };
  }

  /** Peek at availability without spending. */
  canPermit(n: number): boolean {
    this._refill();
    return n <= this._tokens;
  }

  /** Force-consume (shaping with credit): allows going negative —
   * wait-time answers then reflect real debt. Use sparingly; `permit`
   * is the non-borrowing API. */
  consume(n: number): void {
    this._refill();
    this._tokens -= n;
  }

  get tokens(): number {
    this._refill();
    return this._tokens;
  }

  get capacity(): number {
    return this._capacity;
  }
}

/* ------------------------------------------------------------------ */
/* Per-connection shaping                                              */
/* ------------------------------------------------------------------ */

export interface ShapePolicy {
  /** Sustained bytes/sec each direction. */
  readonly readBytesPerSec?: number;
  readonly writeBytesPerSec?: number;
  /** Burst allowances (default: 1 second of rate). */
  readonly readBurstBytes?: number;
  readonly writeBurstBytes?: number;
  /**
   * Hard cap on a single permit's size — calls above this are denied
   * outright regardless of tokens (a chunk bigger than the bucket can
   * never pass; better to reject than silently always wait).
   */
  readonly maxChunkBytes?: number;
}

export interface ShapeResult {
  readonly allowed: boolean;
  /** Aggregate waitMs = max(read, write) when both apply. */
  readonly waitMs: number;
  /** Which direction refused, when denied. */
  readonly deniedBy?: 'read' | 'write' | 'link' | 'chunk';
}

interface ConnectionBuckets {
  read: TokenBucket | null;
  write: TokenBucket | null;
}

/**
 * One connection's read/write buckets + the shared link bucket it
 * contends on.
 */
export class ConnectionShaper {
  private readonly _read: TokenBucket | null;
  private readonly _write: TokenBucket | null;
  private readonly _link: TokenBucket | null;
  private readonly _maxChunk: number;

  constructor(policy: ShapePolicy, clock: EngineClock, link: TokenBucket | null) {
    this._link = link;
    this._maxChunk = policy.maxChunkBytes ?? Number.MAX_SAFE_INTEGER;
    this._read = policy.readBytesPerSec !== undefined
      ? new TokenBucket({
          ratePerSec: policy.readBytesPerSec,
          capacity: policy.readBurstBytes ?? policy.readBytesPerSec,
          clock,
        })
      : null;
    this._write = policy.writeBytesPerSec !== undefined
      ? new TokenBucket({
          ratePerSec: policy.writeBytesPerSec,
          capacity: policy.writeBurstBytes ?? policy.writeBytesPerSec,
          clock,
        })
      : null;
  }

  /** Permit `n` inbound bytes (peer → us). */
  permitRead(n: number): ShapeResult {
    return this._permit(this._read, n, 'read');
  }

  /** Permit `n` outbound bytes (us → peer). */
  permitWrite(n: number): ShapeResult {
    return this._permit(this._write, n, 'write');
  }

  private _permit(bucket: TokenBucket | null, n: number, dir: 'read' | 'write'): ShapeResult {
    if (n > this._maxChunk) {
      return { allowed: false, waitMs: Number.POSITIVE_INFINITY, deniedBy: 'chunk' };
    }
    let waitMs = 0;
    if (bucket !== null) {
      const p = bucket.permit(n);
      if (!p.allowed) {
        return { allowed: false, waitMs: p.waitMs, deniedBy: dir };
      }
      waitMs = Math.max(waitMs, p.waitMs);
    }
    if (this._link !== null) {
      const p = this._link.permit(n);
      if (!p.allowed) {
        return { allowed: false, waitMs: p.waitMs, deniedBy: 'link' };
      }
    }
    return { allowed: true, waitMs };
  }
}

/** Registry: connection id → shaped buckets; shared link bucket. */
export class TrafficShaper {
  private readonly _clock: EngineClock;
  private readonly _defaultPolicy: ShapePolicy;
  private readonly _linkBucket: TokenBucket | null;
  private readonly _conns = new Map<string, ConnectionShaper>();

  constructor(opts: {
    defaultPolicy?: ShapePolicy;
    /** Aggregate link cap (all connections share). */
    linkBytesPerSec?: number;
    linkBurstBytes?: number;
    clock?: EngineClock;
  } = {}) {
    this._clock = opts.clock ?? new SystemEngineClock();
    this._defaultPolicy = opts.defaultPolicy ?? {};
    this._linkBucket = opts.linkBytesPerSec !== undefined
      ? new TokenBucket({
          ratePerSec: opts.linkBytesPerSec,
          capacity: opts.linkBurstBytes ?? opts.linkBytesPerSec,
          clock: this._clock,
        })
      : null;
  }

  /** Get-or-create a connection's shaper. */
  for(connId: string, policy?: ShapePolicy): ConnectionShaper {
    let s = this._conns.get(connId);
    if (!s) {
      s = new ConnectionShaper(policy ?? this._defaultPolicy, this._clock, this._linkBucket);
      this._conns.set(connId, s);
    }
    return s;
  }

  release(connId: string): boolean {
    return this._conns.delete(connId);
  }

  get linkTokens(): number {
    return this._linkBucket?.tokens ?? Number.POSITIVE_INFINITY;
  }
}

/* ------------------------------------------------------------------ */
/* Network namespace simulation                                        */
/* ------------------------------------------------------------------ */

export interface VethPair {
  /** Interface name inside namespace A / B. */
  readonly ifA: string;
  readonly ifB: string;
  readonly nsA: string;
  readonly nsB: string;
  /** Optional link-level rate cap applied to cross-namespace traffic. */
  readonly rateBytesPerSec?: number;
}

export interface RouteResult {
  readonly reachable: boolean;
  /** Hop path when reachable: [srcNs, ...veth links..., dstNs]. */
  readonly path: readonly string[];
  readonly deniedBy?: 'no-link' | 'rate';
}

/**
 * Simulated network namespaces with veth-pair connectivity.
 *
 * A namespace owns a set of "interfaces"; two namespaces communicate
 * only through a veth pair connecting one interface in each — the
 * model's equivalent of `ip link add veth0 type veth peer name veth1`.
 * Routing is a BFS over the namespace adjacency graph (namespaces are
 * nodes, veth pairs edges) — in real netns there is no inter-namespace
 * routing at all; a pair is the *only* bridge, which is what we model.
 */
export class NetworkNamespace {
  readonly name: string;

  private readonly _interfaces = new Set<string>();
  private readonly _ns: NetnsRegistry;

  constructor(name: string, registry: NetnsRegistry) {
    this.name = name;
    this._ns = registry;
  }

  addInterface(ifName: string): void {
    this._interfaces.add(ifName);
  }

  interfaces(): string[] {
    return Array.from(this._interfaces);
  }

  routeTo(other: string): RouteResult {
    return this._ns.route(this.name, other);
  }
}

export class NetnsRegistry {
  private readonly _namespaces = new Map<string, NetworkNamespace>();
  private readonly _links: VethPair[] = [];
  private readonly _linkBuckets = new Map<string, TokenBucket>();
  private readonly _clock: EngineClock;

  constructor(clock: EngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /** Create (or get) a namespace. */
  ns(name: string): NetworkNamespace {
    let n = this._namespaces.get(name);
    if (!n) {
      n = new NetworkNamespace(name, this);
      this._namespaces.set(name, n);
    }
    return n;
  }

  /**
   * Wire a veth pair: `nsA.ifA <-> nsB.ifB`. Interfaces are created if
   * absent. Optional rate cap applies to traffic crossing this pair.
   */
  link(nsA: string, ifA: string, nsB: string, ifB: string, rateBytesPerSec?: number): VethPair {
    const a = this.ns(nsA);
    const b = this.ns(nsB);
    a.addInterface(ifA);
    b.addInterface(ifB);
    const pair: VethPair = { ifA, ifB, nsA, nsB, rateBytesPerSec };
    this._links.push(pair);
    if (rateBytesPerSec !== undefined) {
      this._linkBuckets.set(
        this._linkKey(pair),
        new TokenBucket({ ratePerSec: rateBytesPerSec, capacity: rateBytesPerSec, clock: this._clock })
      );
    }
    return pair;
  }

  /** Remove a veth pair. */
  unlink(nsA: string, ifA: string, nsB: string, ifB: string): boolean {
    const i = this._links.findIndex(
      (l) => l.nsA === nsA && l.ifA === ifA && l.nsB === nsB && l.ifB === ifB
    );
    if (i < 0) return false;
    this._links.splice(i, 1);
    return true;
  }

  /**
   * Can `srcNs` reach `dstNs`? BFS over the veth adjacency graph.
   * Optionally charges `bytes` against each traversed link's rate
   * bucket — a route that exists but is over budget answers
   * `deniedBy: 'rate'`.
   */
  route(srcNs: string, dstNs: string, bytes = 0): RouteResult {
    if (srcNs === dstNs) {
      return { reachable: true, path: [srcNs] };
    }
    // BFS — hop-count shortest path over veth pairs.
    const prev = new Map<string, { from: string; link: VethPair }>();
    const visited = new Set<string>([srcNs]);
    const queue: string[] = [srcNs];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const link of this._links) {
        let next: string | null = null;
        if (link.nsA === cur) next = link.nsB;
        else if (link.nsB === cur) next = link.nsA;
        if (next === null || visited.has(next)) continue;
        visited.add(next);
        prev.set(next, { from: cur, link });
        if (next === dstNs) {
          const path: string[] = [dstNs];
          const traversed: VethPair[] = [];
          let n = dstNs;
          while (n !== srcNs) {
            const p = prev.get(n) as { from: string; link: VethPair };
            traversed.unshift(p.link);
            n = p.from;
            path.unshift(n);
          }
          // Rate-check every link on the path for `bytes`.
          for (const l of traversed) {
            const b = this._linkBuckets.get(this._linkKey(l));
            if (b && !b.permit(bytes).allowed) {
              return { reachable: false, path, deniedBy: 'rate' };
            }
          }
          return { reachable: true, path };
        }
        queue.push(next);
      }
    }
    return { reachable: false, path: [], deniedBy: 'no-link' };
  }

  private _linkKey(l: VethPair): string {
    return `${l.nsA}/${l.ifA}~${l.nsB}/${l.ifB}`;
  }
}
