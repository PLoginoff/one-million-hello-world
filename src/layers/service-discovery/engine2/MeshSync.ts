/**
 * MeshSync — service-mesh sidecar registry synchronization.
 *
 * Models the control-plane → sidecar sync loop (Envoy xDS-style):
 *
 *  - Each sidecar maintains a shadow table of desired endpoints plus a
 *    monotonically increasing `version` (like xDS resource versions).
 *  - `push()` computes a per-sidecar *delta*: added / updated / removed
 *    endpoints since the sidecar's last-acked version. Deltas are staged,
 *    not applied — `ack()` commits them, `nack()` rolls back, matching
 *    the xDS ACK/NACK protocol.
 *  - Sidecars that never ack fall behind; `staleness()` reports how many
 *    versions behind each sidecar is so a control plane can trigger a
 *    full-state resync instead of an ever-growing delta.
 *
 * The "wire" is a pluggable `MeshTransport` so tests can stub delivery —
 * this module owns the bookkeeping, not the transport.
 *
 * Complexity: delta computation is O(desired endpoints + shadow size)
 * via Map diffing; push/ack are O(delta size).
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { ServiceInstance2, SdClock2, SystemSdClock2 } from './types';

/** A signed, versioned snapshot of the desired endpoint table. */
export interface MeshUpdate {
  readonly version: number;
  readonly endpoints: readonly ServiceInstance2[];
  readonly pushedAtMs: number;
}

/** Transport stub — a real impl would stream xDS/gRPC. */
export interface MeshTransport {
  deliver(sidecarId: string, update: MeshUpdate): Promise<boolean>;
}

/** In-memory transport for tests: records deliveries per sidecar. */
export class InMemoryMeshTransport implements MeshTransport {
  readonly delivered = new Map<string, MeshUpdate[]>();
  /** Sidecar ids that should fail delivery (partition simulation). */
  readonly partitioned = new Set<string>();

  async deliver(sidecarId: string, update: MeshUpdate): Promise<boolean> {
    if (this.partitioned.has(sidecarId)) return false;
    const list = this.delivered.get(sidecarId) ?? [];
    list.push(update);
    this.delivered.set(sidecarId, list);
    return true;
  }
}

export type SidecarState = 'in-sync' | 'delta-pending' | 'stale';

export interface SidecarStatus {
  readonly sidecarId: string;
  readonly ackedVersion: number;
  readonly pendingVersion: number | null;
  readonly state: SidecarState;
}

interface SidecarEntry {
  ackedVersion: number;
  /** The shadow table the sidecar last acked. */
  shadow: Map<string, ServiceInstance2>;
  /** Staged delta awaiting ack. */
  pending: { version: number; endpoints: Map<string, ServiceInstance2> } | null;
}

export interface MeshSyncOptions {
  /** Versions behind before a sidecar is 'stale'. Default 3. */
  staleAfterVersions?: number;
  clock?: SdClock2;
}

export class MeshSync {
  private readonly _sidecars = new Map<string, SidecarEntry>();
  private readonly _transport: MeshTransport;
  private readonly _staleAfter: number;
  private readonly _clock: SdClock2;
  private _desired = new Map<string, ServiceInstance2>();
  private _version = 0;
  private _pushFailures = 0;

  constructor(transport: MeshTransport, opts: MeshSyncOptions = {}) {
    this._transport = transport;
    this._staleAfter = Math.max(1, opts.staleAfterVersions ?? 3);
    this._clock = opts.clock ?? new SystemSdClock2();
  }

  /** Replace the desired endpoint table and bump the version. */
  setDesired(endpoints: readonly ServiceInstance2[]): number {
    this._desired = new Map(endpoints.map((e) => [e.instanceId, e]));
    this._version++;
    return this._version;
  }

  get version(): number {
    return this._version;
  }

  /** Register a sidecar; it starts empty at version 0. */
  attachSidecar(sidecarId: string): void {
    this._sidecars.set(sidecarId, {
      ackedVersion: 0,
      shadow: new Map(),
      pending: null,
    });
  }

  detachSidecar(sidecarId: string): boolean {
    return this._sidecars.delete(sidecarId);
  }

  /**
   * Compute the delta for a sidecar and deliver it through the transport.
   * The delta is staged as `pending` — applied only on ack().
   */
  async push(sidecarId: string): Promise<boolean> {
    const sc = this._sidecars.get(sidecarId);
    if (!sc) throw new Error(`unknown sidecar: ${sidecarId}`);
    // Full-state resync when stale beyond threshold: ship the whole table.
    const full = this._version - sc.ackedVersion > this._staleAfter;
    const endpoints = full ? this._desired : this._diff(sc.shadow, this._desired);
    const update: MeshUpdate = {
      version: this._version,
      endpoints: [...endpoints.values()],
      pushedAtMs: this._clock.now(),
    };
    const ok = await this._transport.deliver(sidecarId, update);
    if (!ok) {
      this._pushFailures++;
      return false;
    }
    // Stage the *post-update* table: shadow + delta (or full table).
    sc.pending = {
      version: this._version,
      endpoints: full ? new Map(this._desired) : this._apply(sc.shadow, endpoints),
    };
    return true;
  }

  /**
   * Acknowledge the staged update: shadow table advances to the pending
   * version's view.
   */
  ack(sidecarId: string, version: number): boolean {
    const sc = this._sidecars.get(sidecarId);
    if (!sc || !sc.pending || sc.pending.version !== version) return false;
    sc.shadow = sc.pending.endpoints;
    sc.ackedVersion = version;
    sc.pending = null;
    return true;
  }

  /** Reject the staged update — shadow stays at the last acked state. */
  nack(sidecarId: string): void {
    const sc = this._sidecars.get(sidecarId);
    if (sc) sc.pending = null;
  }

  status(sidecarId: string): SidecarStatus | null {
    const sc = this._sidecars.get(sidecarId);
    if (!sc) return null;
    const lag = this._version - sc.ackedVersion;
    return {
      sidecarId,
      ackedVersion: sc.ackedVersion,
      pendingVersion: sc.pending?.version ?? null,
      state: lag === 0 ? 'in-sync' : lag > this._staleAfter ? 'stale' : 'delta-pending',
    };
  }

  statuses(): SidecarStatus[] {
    return [...this._sidecars.keys()]
      .map((id) => this.status(id))
      .filter((s): s is SidecarStatus => s !== null);
  }

  get pushFailures(): number {
    return this._pushFailures;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Compute the endpoints a sidecar needs to reach `desired` — changed
   * or new entries plus tombstones for removals. Removals are
   * represented by their last-known entry so the sidecar knows what to
   * drop (the payload's `metadata.tombstone` marks it).
   */
  private _diff(
    shadow: Map<string, ServiceInstance2>,
    desired: Map<string, ServiceInstance2>
  ): Map<string, ServiceInstance2> {
    const delta = new Map<string, ServiceInstance2>();
    for (const [id, inst] of desired) {
      const prev = shadow.get(id);
      if (!prev || prev.host !== inst.host || prev.port !== inst.port ||
          prev.weight !== inst.weight || prev.serviceName !== inst.serviceName) {
        delta.set(id, inst);
      }
    }
    for (const [id, inst] of shadow) {
      if (!desired.has(id)) {
        delta.set(id, { ...inst, metadata: { ...inst.metadata, tombstone: '1' } });
      }
    }
    return delta;
  }

  /** Apply a delta (including tombstones) onto a shadow table. */
  private _apply(
    shadow: Map<string, ServiceInstance2>,
    delta: Map<string, ServiceInstance2>
  ): Map<string, ServiceInstance2> {
    const next = new Map(shadow);
    for (const [id, inst] of delta) {
      if (inst.metadata['tombstone'] === '1') next.delete(id);
      else next.set(id, inst);
    }
    return next;
  }
}
