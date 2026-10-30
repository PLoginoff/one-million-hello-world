/**
 * RoomManager — named channels with membership tracking and fan-out.
 *
 * The room abstraction is the standard pub/sub unit over WebSocket
 * servers: a *room* is a named set of connections; `broadcast(room, msg)`
 * writes to every member. Semantics deliberately mirror Socket.IO rooms:
 *
 *  - Membership is per *connection*, not per *user* — one user with three
 *    tabs joined twice is two members (presence is a separate concern,
 *    see `PresenceRegistry`).
 *  - `join`/`leave` are idempotent — double-join is a no-op, leaving a
 *    room you're not in is a no-op. Idempotency matters because real
 *    clients retry joins on flaky networks.
 *  - Broadcast is *all-or-nothing per recipient*: members whose send
 *    fails (closed socket, backpressure drop) are counted and reported
 *    but don't affect other members — fan-out must not cascade.
 *  - Empty rooms are deleted automatically (memory hygiene for
 *    high-cardinality room names like `user:<id>`).
 *
 * Delivery contract: the manager does not know about frames — the caller
 * injects a `send` function per connection (usually `session.sendMessage`
 * wrapped by a `SendQueue`). Broadcast returns per-room delivery stats.
 *
 * Data structures:
 *  - `rooms: Map<name, Set<connId>>` — O(1) join/leave/lookup.
 *  - `memberships: Map<connId, Set<roomName>>` — reverse index so
 *    `leaveAll(connId)` (disconnect cleanup) is O(rooms-joined), not
 *    O(all-rooms). Two indexes = classic bimap; kept consistent in one
 *    place (`_mutate`).
 *
 * Complexity: join/leave O(1); broadcast O(room size); leaveAll
 * O(conn's rooms); memory O(total memberships).
 *
 * @module WebsocketLayer/Server
 */

/** Identity of one connection inside the room system. */
export type ConnectionId = string;

/** Payload broadcast through rooms — serialization is the caller's job. */
export interface RoomBroadcast {
  readonly payload: Buffer | string;
  readonly binary?: boolean;
  /** Exclude these connections from receiving (e.g. the sender). */
  readonly exclude?: ReadonlySet<ConnectionId>;
}

/** Per-broadcast delivery report. */
export interface BroadcastReceipt {
  readonly room: string;
  /** Members the payload was handed to successfully. */
  readonly delivered: number;
  /** Members skipped by the `exclude` set. */
  readonly excluded: number;
  /** Members whose send returned false (closed/backpressured). */
  readonly failed: number;
  /** Members present at broadcast time (delivered+excluded+failed). */
  readonly membershipSize: number;
}

/** Sender function injected per connection — true = accepted for write. */
export type RoomSendFn = (connId: ConnectionId, payload: Buffer | string, binary: boolean) => boolean;

export interface RoomManagerOptions {
  /** Max connections per room; joins beyond this fail. Default ∞. */
  readonly maxRoomSize?: number;
  /** Max distinct rooms; guards against room-name spraying. Default ∞. */
  readonly maxRooms?: number;
}

/** Reasons a {@link RoomManager.join} can refuse. */
export enum JoinRejection {
  ROOM_FULL = 'room-full',
  TOO_MANY_ROOMS = 'too-many-rooms',
}

export class JoinRejectedError extends Error {
  constructor(readonly reason: JoinRejection, room: string) {
    super(`join rejected for room "${room}": ${reason}`);
    this.name = 'JoinRejectedError';
  }
}

export class RoomManager {
  private readonly _rooms = new Map<string, Set<ConnectionId>>();
  private readonly _memberships = new Map<ConnectionId, Set<string>>();
  private readonly _send: RoomSendFn;
  private readonly _maxRoomSize: number;
  private readonly _maxRooms: number;

  /** Lifetime counters. */
  private _joins = 0;
  private _leaves = 0;
  private _broadcasts = 0;
  private _delivered = 0;
  private _failedDeliveries = 0;

  constructor(send: RoomSendFn, options: RoomManagerOptions = {}) {
    this._send = send;
    this._maxRoomSize = options.maxRoomSize ?? Number.POSITIVE_INFINITY;
    this._maxRooms = options.maxRooms ?? Number.POSITIVE_INFINITY;
  }

  get roomCount(): number {
    return this._rooms.size;
  }

  /** All room names currently non-empty (order: insertion). */
  roomNames(): string[] {
    return [...this._rooms.keys()];
  }

  /** Room sizes for dashboards. */
  roomSizes(): ReadonlyMap<string, number> {
    const out = new Map<string, number>();
    for (const [name, members] of this._rooms) out.set(name, members.size);
    return out;
  }

  /** Members of `room` (empty array if the room doesn't exist). */
  members(room: string): ConnectionId[] {
    const members = this._rooms.get(room);
    return members ? [...members] : [];
  }

  /** Rooms `connId` belongs to. */
  roomsOf(connId: ConnectionId): string[] {
    const rooms = this._memberships.get(connId);
    return rooms ? [...rooms] : [];
  }

  isMember(room: string, connId: ConnectionId): boolean {
    return this._rooms.get(room)?.has(connId) ?? false;
  }

  memberCount(room: string): number {
    return this._rooms.get(room)?.size ?? 0;
  }

  /**
   * Add `connId` to `room`. Idempotent — returns false if already a
   * member; throws {@link JoinRejectedError} on cap violations.
   */
  join(room: string, connId: ConnectionId): boolean {
    let members = this._rooms.get(room);
    if (members?.has(connId)) return false;
    if (members === undefined) {
      if (this._rooms.size >= this._maxRooms) {
        throw new JoinRejectedError(JoinRejection.TOO_MANY_ROOMS, room);
      }
      members = new Set<ConnectionId>();
      this._rooms.set(room, members);
    }
    if (members.size >= this._maxRoomSize) {
      throw new JoinRejectedError(JoinRejection.ROOM_FULL, room);
    }
    members.add(connId);
    let rooms = this._memberships.get(connId);
    if (rooms === undefined) {
      rooms = new Set<string>();
      this._memberships.set(connId, rooms);
    }
    rooms.add(room);
    this._joins++;
    return true;
  }

  /**
   * Remove `connId` from `room`. Idempotent — returns false when the
   * membership didn't exist. Deletes the room when it empties.
   */
  leave(room: string, connId: ConnectionId): boolean {
    const members = this._rooms.get(room);
    if (members === undefined || !members.delete(connId)) return false;
    if (members.size === 0) {
      this._rooms.delete(room);
    }
    const rooms = this._memberships.get(connId);
    if (rooms !== undefined) {
      rooms.delete(room);
      if (rooms.size === 0) this._memberships.delete(connId);
    }
    this._leaves++;
    return true;
  }

  /**
   * Remove `connId` from every room — call on disconnect. Returns the
   * rooms it left (for presence fan-out "user left X" notices).
   */
  leaveAll(connId: ConnectionId): string[] {
    const rooms = this._memberships.get(connId);
    if (rooms === undefined) return [];
    const left: string[] = [];
    // Copy — leave() mutates `rooms` set while we iterate.
    for (const room of [...rooms]) {
      if (this.leave(room, connId)) left.push(room);
    }
    return left;
  }

  /**
   * Deliver `broadcast.payload` to every room member (minus `exclude`).
   * Per-member send failures are isolated and counted, never thrown.
   */
  broadcast(room: string, broadcast: RoomBroadcast): BroadcastReceipt {
    const members = this._rooms.get(room);
    if (members === undefined) {
      return { room, delivered: 0, excluded: 0, failed: 0, membershipSize: 0 };
    }
    const binary = broadcast.binary ?? false;
    let delivered = 0;
    let excluded = 0;
    let failed = 0;
    // Snapshot the member set — a send callback may join/leave (a member
    // handler that kicks another member must not corrupt iteration).
    for (const connId of [...members]) {
      if (broadcast.exclude !== undefined && broadcast.exclude.has(connId)) {
        excluded++;
        continue;
      }
      let ok = false;
      try {
        ok = this._send(connId, broadcast.payload, binary);
      } catch {
        ok = false;
      }
      if (ok) delivered++;
      else failed++;
    }
    this._broadcasts++;
    this._delivered += delivered;
    this._failedDeliveries += failed;
    return {
      room,
      delivered,
      excluded,
      failed,
      membershipSize: delivered + excluded + failed,
    };
  }

  /**
   * Broadcast to several rooms at once — deduplicates connections that
   * sit in more than one target room so they receive exactly one copy.
   */
  broadcastMany(rooms: readonly string[], broadcast: RoomBroadcast): BroadcastReceipt {
    const binary = broadcast.binary ?? false;
    const seen = new Set<ConnectionId>();
    let delivered = 0;
    let excluded = 0;
    let failed = 0;
    let membershipSize = 0;
    for (const room of rooms) {
      const members = this._rooms.get(room);
      if (members === undefined) continue;
      for (const connId of [...members]) {
        membershipSize++;
        if (seen.has(connId)) continue;
        if (broadcast.exclude !== undefined && broadcast.exclude.has(connId)) {
          excluded++;
          seen.add(connId);
          continue;
        }
        seen.add(connId);
        let ok = false;
        try {
          ok = this._send(connId, broadcast.payload, binary);
        } catch {
          ok = false;
        }
        if (ok) delivered++;
        else failed++;
      }
    }
    this._broadcasts++;
    this._delivered += delivered;
    this._failedDeliveries += failed;
    return { room: rooms.join(','), delivered, excluded, failed, membershipSize };
  }

  counters(): { joins: number; leaves: number; broadcasts: number; delivered: number; failedDeliveries: number } {
    return {
      joins: this._joins,
      leaves: this._leaves,
      broadcasts: this._broadcasts,
      delivered: this._delivered,
      failedDeliveries: this._failedDeliveries,
    };
  }
}
