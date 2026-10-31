/**
 * CoherenceBus & CoherentNode — version-stamped distributed cache
 * coherence over a broadcast fabric.
 *
 * Problem: N cache nodes each hold a local L1. A write on node A must
 * reach B and C before their next read, or they serve stale data.
 * Naive "broadcast every write" costs a round-trip per set; naive
 * "TTL everything short" wastes hit rate. This module implements the
 * classic middle ground — *invalidation-based coherence*:
 *
 *   write locally → bump the key's version → broadcast a tiny
 *   invalidation record {key, version, originNode} → every peer
 *   either drops or re-stamps its copy.
 *
 * Design (modeled on snoopy-bus / MESI-style protocols, simplified to
 * a two-state I/V machine plus a version vector):
 *
 *   ┌────────┐  invalidate(k,v+1)   ┌──────────┐
 *   │ node A │ ───────────────────► │  bus     │ ──► fan-out to B,C
 *   └────────┘                     └──────────┘
 *
 * Each entry is stamped with a `VersionStamp {nodeId, seq, wall}`.
 * Ordering between two stamps for the *same* key is decided by
 * `compareVersions`:
 *
 *   1. higher `seq` from the *same* origin wins (a node's own writes
 *      are totally ordered by its local sequence counter);
 *   2. across origins we fall back to `wall` (last-writer-wins) with
 *      `nodeId` as the deterministic tiebreak — concurrent writes to
 *      the same key on different nodes converge identically on every
 *      peer, which is the only property coherence actually needs.
 *
 * Lost or reordered messages are the real-world wrinkle: if node B
 * misses `invalidate(k, v2)` and receives `invalidate(k, v3)` later,
 * a pure "delete on invalidate" protocol heals anyway (the delete is
 * version-agnostic). The subtler case is *stale writes*: B holds
 * `k@v2`, receives a delayed `put(k@v1)` replication — without the
 * stamp check that put would regress the key. Every applied mutation
 * is gated on `compareVersions(incoming, current) > 0`, so delayed
 * messages are dropped, not applied. That single rule gives the
 * system *convergence*: once messages stop, all nodes agree.
 *
 * `readRepair`: when a `get` finds the local copy stale *or* absent
 * while peers report a fresher stamp, the owner pulls the winning
 * value, installs it locally, and returns it — the read itself heals
 * the divergence instead of waiting for a background anti-entropy
 * pass. Implemented as `get(key)` → `probe` → `fetch` → `apply`.
 *
 * Complexity: invalidate broadcast O(P) peers, per-message work O(1);
 * probe O(P) round-trips (simulated as synchronous calls on the
 * in-process fabric); storage O(keys) per node.
 *
 * @module CacheLayer/Engine
 */

import { CacheEngineClock, fnv1a32, SystemEngineClock } from './types';

/* ------------------------------------------------------------------ */
/* Version stamps                                                      */
/* ------------------------------------------------------------------ */

/**
 * Per-key version stamp. `seq` is the *originating* node's sequence
 * counter (only it may bump seq); `wall` is the origin's clock time at
 * write; `origin` disambiguates concurrent writers deterministically.
 */
export interface VersionStamp {
  /** Node that produced this write. */
  readonly origin: string;
  /** Monotonic counter at the origin; never reused per node. */
  readonly seq: number;
  /** Origin's wall-clock at the write — cross-node tiebreak input. */
  readonly wall: number;
}

/**
 * Total order used by every conflict decision in the module.
 *
 *   >0  a wins   <0  b wins   0  identical
 *
 * Rule 1 — same origin: pure `seq` compare. A node can never issue a
 * smaller seq after a larger one, so its writes are totally ordered
 * and this branch is a *happens-before* order, not a guess.
 *
 * Rule 2 — different origins: concurrent by definition; fall back to
 * (wall, origin) lexicographic — last-writer-wins with a deterministic
 * tiebreak so every node resolves the race the same way.
 */
export function compareVersions(a: VersionStamp, b: VersionStamp): number {
  if (a.origin === b.origin) {
    return a.seq - b.seq;
  }
  if (a.wall !== b.wall) {
    return a.wall - b.wall;
  }
  return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
}

/** Convenience predicate: `a` strictly newer than `b`. */
export function isNewer(a: VersionStamp, b: VersionStamp): boolean {
  return compareVersions(a, b) > 0;
}

/* ------------------------------------------------------------------ */
/* Wire messages                                                       */
/* ------------------------------------------------------------------ */

/**
 * What travels on the bus. Kept deliberately small — invalidation
 * protocols win over state-transfer protocols precisely because these
 * records are O(1) bytes instead of O(value).
 */
export type CoherenceMessage =
  | {
      readonly kind: 'invalidate';
      readonly key: string;
      readonly version: VersionStamp;
      readonly origin: string;
    }
  | {
      readonly kind: 'replicate';
      readonly key: string;
      readonly value: unknown;
      readonly ttlMs: number;
      readonly version: VersionStamp;
      readonly origin: string;
    }
  | {
      readonly kind: 'probe';
      readonly key: string;
      /** Asks peers: "what version do you hold?" — read-repair step 1. */
      readonly origin: string;
    }
  | {
      readonly kind: 'fetch';
      readonly key: string;
      /** Asks one peer: "give me your value" — read-repair step 2. */
      readonly origin: string;
    };

/* ------------------------------------------------------------------ */
/* Bus                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The delivery fabric. `CoherenceBus` is the in-process implementation
 * used by tests and by single-host simulations; a real deployment
 * would slot a pub/sub (Redis channel, NATS, gossip) behind the same
 * interface.
 */
export interface CoherenceFabric {
  /**
   * Deliver `msg` to every attached node *except* `msg.origin`.
   * Synchronous in the reference implementation — ordering of a single
   * broadcast is therefore atomic, which is what the convergence
   * argument above assumes.
   */
  broadcast(msg: CoherenceMessage): void;
  /** Deliver `msg` to exactly one node (fetch/reply path). */
  unicast(nodeId: string, msg: CoherenceMessage): void;
  attach(node: CoherentNode<unknown>): void;
  detach(nodeId: string): void;
}

/**
 * In-memory broadcast bus. Optionally models loss/reorder per message
 * kind via `dropProbability` — deterministic under a seeded RNG so
 * tests can prove convergence under loss, not just under perfection.
 */
export class CoherenceBus implements CoherenceFabric {
  private readonly _nodes = new Map<string, CoherentNode<unknown>>();
  /** Counters for tests: what actually went over the wire. */
  readonly stats = {
    broadcasts: 0,
    unicasts: 0,
    delivered: 0,
    dropped: 0,
  };

  private readonly _dropProbability: number;
  private readonly _rng: () => number;

  constructor(opts: { dropProbability?: number; rng?: () => number } = {}) {
    this._dropProbability = Math.min(1, Math.max(0, opts.dropProbability ?? 0));
    this._rng = opts.rng ?? Math.random;
  }

  attach(node: CoherentNode<unknown>): void {
    this._nodes.set(node.nodeId, node);
  }

  detach(nodeId: string): void {
    this._nodes.delete(nodeId);
  }

  broadcast(msg: CoherenceMessage): void {
    this.stats.broadcasts++;
    for (const [id, node] of this._nodes) {
      if (id === msg.origin) continue;
      if (this._rng() < this._dropProbability) {
        this.stats.dropped++;
        continue;
      }
      this.stats.delivered++;
      node.receive(msg);
    }
  }

  unicast(nodeId: string, msg: CoherenceMessage): void {
    this.stats.unicasts++;
    const node = this._nodes.get(nodeId);
    if (!node || nodeId === msg.origin) {
      this.stats.dropped++;
      return;
    }
    if (this._rng() < this._dropProbability) {
      this.stats.dropped++;
      return;
    }
    this.stats.delivered++;
    node.receive(msg);
  }

  /** Nodes currently attached (probe fan-out size, test assertions). */
  get attachedCount(): number {
    return this._nodes.size;
  }
}

/* ------------------------------------------------------------------ */
/* Node                                                                */
/* ------------------------------------------------------------------ */

/** Coherence state of one cached entry — the I/V state machine. */
export const enum CoherenceState {
  /** Present and believed current. */
  VALID = 'valid',
  /**
   * Marked stale by an invalidate whose version beat ours but whose
   * value we haven't pulled yet — serves miss, eligible for repair.
   */
  STALE = 'stale',
}

export interface CoherentEntry<T> {
  readonly value: T;
  readonly version: VersionStamp;
  readonly state: CoherenceState;
  /** Absolute expiry (clock ms); 0 = immortal. */
  readonly expiresAt: number;
  /**
   * STALE entries only: the version of the write that invalidated us.
   * Read-repair accepts fetched versions >= this floor — anything
   * older would re-install a value we *know* was superseded.
   */
  readonly floorVersion?: VersionStamp;
}

export interface CoherentNodeOptions {
  /** Default TTL for local writes; <=0 means immortal. */
  readonly defaultTtlMs?: number;
  /**
   * When true, a `set` also broadcasts a `replicate` (push the value,
   * not just the tombstone) — the eager-coherence regime. Default
   * false: pure invalidation, readers pull on miss.
   */
  readonly eagerReplication?: boolean;
  /**
   * When true (default), `get` on STALE/absent triggers a peer probe +
   * fetch; when false, stale entries are simply dropped.
   */
  readonly readRepair?: boolean;
  readonly clock?: CacheEngineClock;
}

export interface CoherenceGetResult<T> {
  readonly hit: boolean;
  readonly value?: T;
  /** Where the served value came from. */
  readonly servedBy: 'local' | 'repaired' | 'miss';
  readonly version?: VersionStamp;
}

export interface NodeStats {
  readonly entries: number;
  readonly validEntries: number;
  readonly staleEntries: number;
  readonly localWrites: number;
  readonly invalidationsSent: number;
  readonly invalidationsReceived: number;
  readonly invalidationsApplied: number;
  /** Delayed/rewound messages dropped by the version gate. */
  readonly staleMessagesDropped: number;
  readonly probesSent: number;
  readonly repairsPerformed: number;
}

/**
 * One coherence participant: a versioned local store glued to a
 * `CoherenceFabric`.
 */
export class CoherentNode<T> {
  readonly nodeId: string;

  private readonly _fabric: CoherenceFabric;
  private readonly _clock: CacheEngineClock;
  private readonly _defaultTtlMs: number;
  private readonly _eagerReplication: boolean;
  private readonly _readRepair: boolean;

  /** Local seq counter — only *this* node bumps it (origin = us). */
  private _seq = 0;
  private readonly _entries = new Map<string, CoherentEntry<T>>();

  private _localWrites = 0;
  private _invalidationsSent = 0;
  private _invalidationsReceived = 0;
  private _invalidationsApplied = 0;
  private _staleDropped = 0;
  private _probesSent = 0;
  private _repairs = 0;

  constructor(nodeId: string, fabric: CoherenceFabric, opts: CoherentNodeOptions = {}) {
    this.nodeId = nodeId;
    this._fabric = fabric;
    this._clock = opts.clock ?? new SystemEngineClock();
    this._defaultTtlMs = opts.defaultTtlMs ?? 0;
    this._eagerReplication = opts.eagerReplication ?? false;
    this._readRepair = opts.readRepair ?? true;
    fabric.attach(this as unknown as CoherentNode<unknown>);
  }

  /* ------------------------------------------------------------ */
  /* Local API                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Write locally, then tell the world. The value is stamped with our
   * next seq so peers can order it against anything else they see.
   */
  set(key: string, value: T, ttlMs?: number): VersionStamp {
    const version = this._nextStamp();
    const ttl = ttlMs ?? this._defaultTtlMs;
    this._install(key, value, version, ttl, CoherenceState.VALID);
    this._localWrites++;
    this._invalidationsSent++;
    if (this._eagerReplication) {
      this._fabric.broadcast({
        kind: 'replicate',
        key,
        value,
        ttlMs: ttl,
        version,
        origin: this.nodeId,
      });
    } else {
      this._fabric.broadcast({
        kind: 'invalidate',
        key,
        version,
        origin: this.nodeId,
      });
    }
    return version;
  }

  /**
   * Read with coherence. VALID → serve. STALE/absent → read-repair:
   * probe peers for the freshest stamp, fetch from the winner, install
   * locally, serve. Miss everywhere → miss.
   */
  get(key: string): CoherenceGetResult<T> {
    const now = this._clock.now();
    const local = this._entries.get(key);
    if (local && local.state === CoherenceState.VALID && !this._expired(local, now)) {
      return { hit: true, value: local.value, servedBy: 'local', version: local.version };
    }

    if (!this._readRepair) {
      if (local) this._entries.delete(key);
      return { hit: false, servedBy: 'miss' };
    }

    // An EXPIRED local entry may not be repaired back from a peer —
    // expiry is local intent (TTL), and pulling the same version from
    // a replica would resurrect it. Delete-then-miss instead.
    const wasExpired = local !== undefined && this._expired(local, now);
    if (wasExpired) {
      this._entries.delete(key);
      return { hit: false, servedBy: 'miss' };
    }

    const repaired = this._repairRead(key);
    if (repaired === null) {
      return { hit: false, servedBy: 'miss' };
    }
    this._repairs++;
    return { hit: true, value: repaired.value, servedBy: 'repaired', version: repaired.version };
  }

  /**
   * The stamp this node currently holds for `key` (VALID or STALE) —
   * the answer a `probe` wants.
   */
  versionOf(key: string): VersionStamp | null {
    const e = this._entries.get(key);
    if (!e || this._expired(e, this._clock.now())) return null;
    return e.version;
  }

  /** Value for `key` regardless of state — the answer a `fetch` wants. */
  fetchValue(key: string): { value: T; version: VersionStamp; ttlMs: number } | null {
    const e = this._entries.get(key);
    if (!e || this._expired(e, this._clock.now())) return null;
    const ttlMs = e.expiresAt === 0 ? 0 : Math.max(0, e.expiresAt - this._clock.now());
    return { value: e.value, version: e.version, ttlMs };
  }

  /** Local delete + broadcast invalidate (tombstone propagation). */
  delete(key: string): boolean {
    const had = this._entries.delete(key);
    const version = this._nextStamp();
    this._invalidationsSent++;
    this._fabric.broadcast({ kind: 'invalidate', key, version, origin: this.nodeId });
    return had;
  }

  /** Detach from the fabric; further broadcasts skip this node. */
  leave(): void {
    this._fabric.detach(this.nodeId);
  }

  /* ------------------------------------------------------------ */
  /* Inbound messages                                              */
  /* ------------------------------------------------------------ */

  /** Entry point used by the fabric. */
  receive(msg: CoherenceMessage): void {
    switch (msg.kind) {
      case 'invalidate':
        this._onInvalidate(msg.key, msg.version);
        break;
      case 'replicate':
        this._onReplicate(msg.key, msg.value as T, msg.ttlMs, msg.version);
        break;
      case 'probe':
      case 'fetch':
        // Queries are answered synchronously by the fabric calling
        // versionOf/fetchValue directly — nothing to do here.
        break;
    }
  }

  /**
   * Invalidate handling. The version gate is the whole protocol:
   *
   *   incoming > current  → mark STALE (keep the old value around for
   *                         one fetch in case the peer that wrote it
   *                         died before a replicate; the entry can't be
   *                         *served* anymore but still answers fetches).
   *   incoming <= current → drop: our copy is fresher — the delayed
   *                         message regresses nothing.
   */
  private _onInvalidate(key: string, version: VersionStamp): void {
    this._invalidationsReceived++;
    const cur = this._entries.get(key);
    if (!cur) {
      // Nothing cached — still record applied count? No: the
      // invalidation is a no-op for us. Not counted as applied.
      return;
    }
    if (!isNewer(version, cur.version)) {
      this._staleDropped++;
      return;
    }
    this._invalidationsApplied++;
    // Keep the old value (it can still answer fetches for lagging
    // peers) but record the invalidating stamp as the repair floor.
    this._entries.set(key, { ...cur, state: CoherenceState.STALE, floorVersion: version });
  }

  /**
   * Replicated put — same gate: only install if it beats what we have.
   * This is what makes delayed replication harmless.
   */
  private _onReplicate(key: string, value: T, ttlMs: number, version: VersionStamp): void {
    const cur = this._entries.get(key);
    if (cur && !isNewer(version, cur.version)) {
      this._staleDropped++;
      return;
    }
    this._install(key, value, version, ttlMs, CoherenceState.VALID);
  }

  /* ------------------------------------------------------------ */
  /* Read repair                                                   */
  /* ------------------------------------------------------------ */

  /**
   * Probe → pick winner → fetch → install.
   *
   * The probe is synchronous against the fabric's node table — a real
   * deployment would gather `versionOf` replies over the wire. We
   * keep it synchronous because the convergence property doesn't
   * depend on probe latency, only on the version comparisons.
   */
  private _repairRead(key: string): { value: T; version: VersionStamp; ttlMs: number } | null {
    this._probesSent++;
    const bus = this._fabric as { _nodes?: Map<string, CoherentNode<unknown>> };
    if (!bus._nodes) {
      // Fabric doesn't expose peers (e.g. a real network transport
      // would implement probe via messages); degrade to miss.
      return null;
    }
    const local = this._entries.get(key);
    // Repair floor: a STALE entry knows the version that killed it,
    // so repairs accept versions >= that floor (the writer itself
    // qualifies — compareVersions == 0 means the same write). A merely
    // absent entry requires strictly-newer-than-nothing, i.e. any
    // version; a still-versioned entry requires strictly newer.
    const floor = local?.floorVersion ?? local?.version ?? null;
    const floorInclusive = local?.floorVersion !== undefined;
    const acceptable = (v: VersionStamp): boolean =>
      floor === null ? true : floorInclusive ? compareVersions(v, floor) >= 0 : isNewer(v, floor);

    let best: { node: CoherentNode<unknown>; version: VersionStamp } | null = null;
    for (const [id, node] of bus._nodes) {
      if (id === this.nodeId) continue;
      const v = node.versionOf(key);
      if (!v) continue;
      if (!acceptable(v)) continue;
      if (best === null || isNewer(v, best.version)) {
        best = { node, version: v };
      }
    }
    if (best === null) return null;
    // The peer table is heterogeneous (CoherentNode<unknown>); the
    // fetched value is cast to T — sound because keys are namespaced
    // per node type in practice (a CoherentNode<string> fabric only
    // ever peers with string-valued nodes).
    const fetched = best.node.fetchValue(key) as {
      value: T;
      version: VersionStamp;
      ttlMs: number;
    } | null;
    if (fetched === null) return null;
    // Final gate on the actual fetched stamp — the winner may have
    // been repaired/evicted between probe and fetch.
    if (!acceptable(fetched.version)) return null;
    this._install(key, fetched.value, fetched.version, fetched.ttlMs, CoherenceState.VALID);
    return fetched;
  }

  /* ------------------------------------------------------------ */
  /* Internals                                                     */
  /* ------------------------------------------------------------ */

  private _nextStamp(): VersionStamp {
    this._seq++;
    return { origin: this.nodeId, seq: this._seq, wall: this._clock.now() };
  }

  private _install(
    key: string,
    value: T,
    version: VersionStamp,
    ttlMs: number,
    state: CoherenceState
  ): void {
    const expiresAt = ttlMs > 0 ? this._clock.now() + ttlMs : 0;
    this._entries.set(key, { value, version, state, expiresAt });
  }

  private _expired(e: CoherentEntry<T>, now: number): boolean {
    return e.expiresAt > 0 && now >= e.expiresAt;
  }

  /** Snapshot for tests/metrics. */
  stats(): NodeStats {
    let valid = 0;
    let stale = 0;
    for (const e of this._entries.values()) {
      if (e.state === CoherenceState.VALID) valid++;
      else stale++;
    }
    return {
      entries: this._entries.size,
      validEntries: valid,
      staleEntries: stale,
      localWrites: this._localWrites,
      invalidationsSent: this._invalidationsSent,
      invalidationsReceived: this._invalidationsReceived,
      invalidationsApplied: this._invalidationsApplied,
      staleMessagesDropped: this._staleDropped,
      probesSent: this._probesSent,
      repairsPerformed: this._repairs,
    };
  }

  /** Raw entry peek for tests — no expiry/read-repair side effects. */
  peek(key: string): CoherentEntry<T> | null {
    return this._entries.get(key) ?? null;
  }
}

/**
 * Deterministic RNG for loss-modeling tests — mulberry32, 32-bit
 * state, well-distributed for this purpose (not cryptographic).
 */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a key to a stable numeric id — exposed for tests that want to
 * derive deterministic node ownership without importing the ring.
 */
export function keyHash(key: string): number {
  return fnv1a32(key);
}
