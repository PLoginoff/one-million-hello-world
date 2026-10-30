/**
 * Version Usage Tracker
 *
 * Records which clients call which API versions so lifecycle decisions
 * (when is it safe to sunset v1?) are driven by evidence rather than
 * guesswork.
 *
 * Data structure:
 * - `_cells`: Map keyed by `clientId` -> Map keyed by `version` ->
 *   running {@link ClientVersionUsage} aggregate. Two-level maps keep
 *   both per-client and per-version queries fast without a global scan:
 *   `clientsOf(v)` scans all client maps — O(C) where C = clients —
 *   while `versionsOf(c)` is a single map read.
 * - Raw records are not retained; only aggregates plus a bounded
 *   per-(client,version) endpoint histogram. This keeps memory
 *   proportional to distinct (client, version, endpoint) tuples, not
 *   call volume — O(distinct tuples) space regardless of traffic.
 *
 * @module ApiVersioningLayer/Engine2
 */

import { ClientVersionUsage, IClock, SystemClock, UsageRecord } from './types';

export class VersionUsageTracker {
  private readonly _cells: Map<string, Map<string, ClientVersionUsage>>;
  /** clientId -> version -> endpoint -> count histogram. */
  private readonly _endpoints: Map<string, Map<string, Map<string, number>>>;
  private readonly _clock: IClock;
  private _totalCalls: number;

  constructor(clock: IClock = new SystemClock()) {
    this._cells = new Map();
    this._endpoints = new Map();
    this._clock = clock;
    this._totalCalls = 0;
  }

  /** Record one API call. O(1) amortised. */
  record(clientId: string, version: string, endpoint: string): void {
    const now = this._clock.now();
    const record: UsageRecord = { clientId, version, endpoint, at: now };
    void record;

    let perVersion = this._cells.get(clientId);
    if (!perVersion) {
      perVersion = new Map();
      this._cells.set(clientId, perVersion);
    }
    let cell = perVersion.get(version);
    if (!cell) {
      cell = { clientId, version, calls: 0, firstSeenAt: now, lastSeenAt: now };
      perVersion.set(version, cell);
    }
    cell.calls += 1;
    cell.lastSeenAt = now;

    let vMap = this._endpoints.get(clientId);
    if (!vMap) {
      vMap = new Map();
      this._endpoints.set(clientId, vMap);
    }
    let eMap = vMap.get(version);
    if (!eMap) {
      eMap = new Map();
      vMap.set(version, eMap);
    }
    eMap.set(endpoint, (eMap.get(endpoint) ?? 0) + 1);
    this._totalCalls += 1;
  }

  /** All clients observed calling `version`, sorted by call count desc. */
  clientsOf(version: string): string[] {
    const hits: Array<{ clientId: string; calls: number }> = [];
    for (const [clientId, perVersion] of this._cells.entries()) {
      const cell = perVersion.get(version);
      if (cell) hits.push({ clientId, calls: cell.calls });
    }
    hits.sort((a, b) => b.calls - a.calls);
    return hits.map((h) => h.clientId);
  }

  /** All versions a client has ever called, with usage aggregates. */
  versionsOf(clientId: string): ClientVersionUsage[] {
    const perVersion = this._cells.get(clientId);
    if (!perVersion) return [];
    return Array.from(perVersion.values()).sort((a, b) => b.calls - a.calls);
  }

  /** Per-version call totals across all clients. */
  versionTotals(): Map<string, number> {
    const totals = new Map<string, number>();
    for (const perVersion of this._cells.values()) {
      for (const cell of perVersion.values()) {
        totals.set(cell.version, (totals.get(cell.version) ?? 0) + cell.calls);
      }
    }
    return totals;
  }

  /**
   * Share of calls to `version` out of all tracked calls, in [0, 1].
   * Returns 0 when nothing has been recorded.
   */
  versionShare(version: string): number {
    if (this._totalCalls === 0) return 0;
    return (this.versionTotals().get(version) ?? 0) / this._totalCalls;
  }

  /** Endpoint histogram for a (client, version) pair — most-called first. */
  endpointsOf(clientId: string, version: string): Array<{ endpoint: string; calls: number }> {
    const eMap = this._endpoints.get(clientId)?.get(version);
    if (!eMap) return [];
    return Array.from(eMap.entries())
      .map(([endpoint, calls]) => ({ endpoint, calls }))
      .sort((a, b) => b.calls - a.calls);
  }

  /**
   * Clients idle on `version` for at least `idleMs` — candidates for
   * outreach before retirement. A client with no record for the version
   * is not "idle" — they simply never used it.
   */
  idleClients(version: string, idleMs: number): string[] {
    const now = this._clock.now();
    const out: string[] = [];
    for (const [clientId, perVersion] of this._cells.entries()) {
      const cell = perVersion.get(version);
      if (cell && now - cell.lastSeenAt >= idleMs) out.push(clientId);
    }
    return out;
  }

  /** True when no client has ever been observed calling `version`. */
  isUnused(version: string): boolean {
    return this.clientsOf(version).length === 0;
  }

  /** Total recorded calls across all clients and versions. */
  totalCalls(): number {
    return this._totalCalls;
  }
}
