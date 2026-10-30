/**
 * ClusterRouter — consistent-hash ownership of connections across nodes.
 *
 * In a websocket cluster each connection lives on exactly one node. To
 * answer "which node holds connection X?" without a central registry we
 * use consistent hashing (Karger et al.): both node ids and connection
 * keys hash onto a 2^32 ring; a key belongs to the first node clockwise.
 *
 * Virtual nodes (vnodes) smooth the distribution: each physical node owns
 * `replicas` points, so removing one node only remaps ~1/N of keys and
 * load spread stays ~±10% at 150 vnodes/node.
 *
 * Data structure: sorted array of vnode hashes + binary search —
 *   lookup O(log(V)), add O(V) (insert into sorted array), remove O(V).
 * With V = nodes × replicas this is fine for thousands of nodes.
 *
 * Ownership tracking is per-connection: `attach(conn)` binds a connection
 * to whatever node currently owns its key, so node churn can be observed
 * via `remap()` which reports which connections must migrate.
 *
 * Hash: FNV-1a 32-bit — deterministic, fast, good avalanche for short
 * keys; deliberately NOT cryptographic.
 *
 * @module WebsocketLayer/Engine2
 */

export interface ClusterNode2 {
  /** Unique node id, e.g. "ws-3.internal:8443". */
  readonly id: string;
  /** Relative capacity weight — heavier nodes get proportionally more
   *  vnodes. Default 1. */
  readonly weight?: number;
}

/** Result of resolving a key to its owning node. */
export interface RouteResult {
  readonly nodeId: string;
  /** Ring position the key hashed to. */
  readonly keyHash: number;
  /** Vnode point that claimed it. */
  readonly vnodeHash: number;
}

export interface ClusterRouterOptions {
  /** Base vnodes per node (multiplied by weight). Default 150. */
  replicas?: number;
  /** Optional hash function override (testing/distribution analysis). */
  hash?: (key: string) => number;
}

/** FNV-1a 32-bit hash. */
function fnv1a(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Vnode {
  hash: number;
  nodeId: string;
}

export class ClusterRouter {
  private readonly _replicas: number;
  private readonly _hash: (key: string) => number;
  private readonly _weights = new Map<string, number>();
  /** Sorted vnode ring. */
  private _ring: Vnode[] = [];
  /** connKey → owning nodeId at attach time. */
  private readonly _ownership = new Map<string, string>();

  constructor(opts: ClusterRouterOptions = {}) {
    this._replicas = Math.max(1, opts.replicas ?? 150);
    this._hash = opts.hash ?? fnv1a;
  }

  /** Add a node. Rebuilds its vnode points and re-sorts the ring. */
  addNode(node: ClusterNode2): void {
    const w = Math.max(1, Math.floor(node.weight ?? 1));
    this._weights.set(node.id, w);
    const count = this._replicas * w;
    for (let i = 0; i < count; i++) {
      this._ring.push({ hash: this._hash(`${node.id}#${i}`), nodeId: node.id });
    }
    this._ring.sort((a, b) => a.hash - b.hash);
  }

  /** Remove a node and all its vnodes. */
  removeNode(nodeId: string): boolean {
    if (!this._weights.delete(nodeId)) return false;
    this._ring = this._ring.filter((v) => v.nodeId !== nodeId);
    return true;
  }

  /** Current physical node ids. */
  nodeIds(): string[] {
    return [...this._weights.keys()];
  }

  /** Total vnode points on the ring. */
  get ringSize(): number {
    return this._ring.length;
  }

  /**
   * Resolve a key to its owning node — first vnode clockwise on the ring.
   * Returns null on an empty ring.
   */
  resolve(key: string): RouteResult | null {
    if (this._ring.length === 0) return null;
    const keyHash = this._hash(key);
    // Binary search for the first vnode with hash >= keyHash (wrap around).
    let lo = 0;
    let hi = this._ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._ring[mid].hash < keyHash) lo = mid + 1;
      else hi = mid;
    }
    const vnode = this._ring[lo % this._ring.length];
    return { nodeId: vnode.nodeId, keyHash, vnodeHash: vnode.hash };
  }

  /**
   * Bind a connection key to its current owner. Returns the owner.
   * Idempotent — re-attaching the same key returns the same node unless
   * the ring changed.
   */
  attach(connKey: string): string | null {
    const r = this.resolve(connKey);
    if (!r) return null;
    this._ownership.set(connKey, r.nodeId);
    return r.nodeId;
  }

  /** Which node currently owns an attached key (re-resolves live). */
  ownerOf(connKey: string): string | null {
    return this.resolve(connKey)?.nodeId ?? null;
  }

  /** Node recorded at attach time (stale if ring changed). */
  attachedOwner(connKey: string): string | null {
    return this._ownership.get(connKey) ?? null;
  }

  detach(connKey: string): boolean {
    return this._ownership.delete(connKey);
  }

  /**
   * After a ring change, report which attached keys must migrate.
   * O(#attached × log V).
   */
  remap(): Array<{ key: string; from: string; to: string }> {
    const moves: Array<{ key: string; from: string; to: string }> = [];
    for (const [key, oldNode] of this._ownership) {
      const r = this.resolve(key);
      if (r && r.nodeId !== oldNode) {
        moves.push({ key, from: oldNode, to: r.nodeId });
        this._ownership.set(key, r.nodeId);
      }
    }
    return moves;
  }

  /**
   * Keys an attached node currently claims — used for targeted delivery
   * ("node N should hold these connections").
   */
  keysForNode(nodeId: string): string[] {
    const out: string[] = [];
    for (const [key, owner] of this._ownership) {
      if (owner === nodeId) out.push(key);
    }
    return out;
  }

  /**
   * Distribution analysis: fraction of the 2^32 arc each node owns.
   * Useful for verifying balance after weight changes.
   */
  loadDistribution(): Map<string, number> {
    const share = new Map<string, number>();
    if (this._ring.length === 0) return share;
    const RING = 2 ** 32;
    for (let i = 0; i < this._ring.length; i++) {
      const cur = this._ring[i];
      const next = this._ring[(i + 1) % this._ring.length];
      const arc = i === this._ring.length - 1 ? RING - cur.hash + this._ring[0].hash : next.hash - cur.hash;
      share.set(cur.nodeId, (share.get(cur.nodeId) ?? 0) + arc / RING);
    }
    return share;
  }
}
