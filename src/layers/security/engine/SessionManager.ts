/**
 * SessionManager — create/validate/rotate/destroy sessions with
 * sliding expiry and fixation defense.
 *
 * A session is just a server-side record {id, data, createdAt,
 * expiresAt, absoluteExpiryAt, generation} addressed by an opaque id.
 * The interesting mechanics:
 *
 *  - SLIDING EXPIRY: `validate` succeeds within `idleTimeoutMs` of the
 *    last touch *and* before `absoluteLifetimeMs` from creation — a
 *    sliding window alone lets an active session live forever, which
 *    is why real session stores pair it with an absolute cap.
 *
 *  - ROTATION: `rotate` mints a new id and bumps `generation`,
 *    carrying data + creation time. This is the session-fixation
 *    defense: on privilege change (login, elevating) the old id must
 *    die. `gracePeriodMs` lets the old id validate *once more* —
 *    browsers race parallel requests through a rotation and the
 *    loser must not be logged out; the grace marks it "rotated" so a
 *    second use of the old id is rejected (reuse-detection: seeing an
 *    already-rotated id twice signals theft → `rotate()` kills the
 *    whole lineage).
 *
 *  - ID GENERATION: `sessionId = random(16B) . HMAC(id, secret)` —
 *    the suffix lets `validate` reject forged ids without a store
 *    lookup (cheap filter in front of the map).
 *
 * Storage is an injectable `SessionStore` (sync — sessions are
 * hot-path; the reference impl is a Map with lazy expiry sweeps).
 *
 * Complexity: all ops O(1); sweep O(sessions); memory O(sessions).
 *
 * @module SecurityLayer/Engine
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SecurityClock, SystemSecurityClock } from './types';

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface SessionRecord {
  /** Opaque id presented to clients (includes HMAC suffix). */
  readonly id: string;
  /** Lookup key = HMAC(id) — we never store the raw id so a leaked
   *  snapshot of the store doesn't leak usable session ids. */
  readonly key: string;
  /** Bumped on rotate; lineage tracking for reuse detection. */
  readonly generation: number;
  /** Lineage root — survives rotations so reuse-kill nips the chain. */
  readonly familyId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  /** Sliding deadline: lastTouch + idleTimeout. */
  readonly expiresAt: number;
  /** Hard deadline: createdAt + absoluteLifetime. */
  readonly absoluteExpiresAt: number;
  /** When set, the id is rotated-away; valid until this timestamp only. */
  readonly rotatedUntil: number | null;
}

/**
 * Storage contract. Sync because session validation is per-request
 * hot path — a Redis impl would wrap this in an async facade at the
 * caller's boundary, not force every read through a promise here.
 */
export interface SessionStore {
  get(key: string): SessionRecord | null;
  set(key: string, record: SessionRecord): void;
  delete(key: string): boolean;
  /** Remove expired records; returns count removed. */
  sweep(now: number): number;
  readonly size: number;
}

export class InMemorySessionStore implements SessionStore {
  private readonly _map = new Map<string, SessionRecord>();

  get(key: string): SessionRecord | null {
    return this._map.get(key) ?? null;
  }

  set(key: string, record: SessionRecord): void {
    this._map.set(key, record);
  }

  delete(key: string): boolean {
    return this._map.delete(key);
  }

  sweep(now: number): number {
    let n = 0;
    for (const [k, r] of this._map) {
      const graceOver = r.rotatedUntil !== null && now >= r.rotatedUntil;
      const expired = now >= r.expiresAt || now >= r.absoluteExpiresAt;
      if (graceOver || expired) {
        this._map.delete(k);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    return this._map.size;
  }
}

/* ------------------------------------------------------------------ */
/* Manager                                                             */
/* ------------------------------------------------------------------ */

export interface SessionManagerOptions {
  /** HMAC secret for id signing + store-key derivation. */
  readonly secret: string;
  /** Idle timeout (sliding). Default 30 min. */
  readonly idleTimeoutMs?: number;
  /** Hard cap from creation. Default 12h. */
  readonly absoluteLifetimeMs?: number;
  /** Old-id grace after rotate (parallel-request window). Default 10s. */
  readonly rotateGraceMs?: number;
  /**
   * Touch throttle: validate() only refreshes expiresAt if the session
   * is at least this old — a hot session shouldn't rewrite the store
   * record on every request (write amplification for nothing).
   * Default 60s.
   */
  readonly touchMinIntervalMs?: number;
  readonly clock?: SecurityClock;
  readonly store?: SessionStore;
}

export const enum SessionVerdict {
  VALID = 'valid',
  /** Unknown id or bad signature. */
  INVALID = 'invalid',
  /** Idle or absolute deadline passed. */
  EXPIRED = 'expired',
  /** Old id presented inside its rotation grace — treat as valid but
   *  the caller should send the NEW id downstream. */
  ROTATED = 'rotated',
  /**
   * A rotated id presented after its grace — reuse of a dead id
   * signals theft; the manager kills the whole lineage as a
   * precaution and reports this verdict.
   */
  REUSE_DETECTED = 'reuse-detected',
}

export interface SessionValidation {
  readonly verdict: SessionVerdict;
  /** The session record when verdict is VALID or ROTATED. */
  readonly session?: SessionRecord;
  /**
   * The id the client should be using: for ROTATED, the successor id;
   * for VALID, the same id. Absent otherwise.
   */
  readonly currentId?: string;
}

export interface CreateResult {
  readonly id: string;
  readonly session: SessionRecord;
}

export class SessionManager {
  private readonly _secret: string;
  private readonly _idleMs: number;
  private readonly _absoluteMs: number;
  private readonly _graceMs: number;
  private readonly _touchMinMs: number;
  private readonly _clock: SecurityClock;
  private readonly _store: SessionStore;
  /** familyId → current valid session key (lineage for reuse-kill). */
  private readonly _families = new Map<string, string>();
  /** rotated-away old key → successor key (grace-window forwarding). */
  private readonly _successors = new Map<string, string>();

  constructor(opts: SessionManagerOptions) {
    if (!opts.secret || opts.secret.length < 8) {
      throw new Error('SessionManager: secret must be ≥ 8 chars');
    }
    this._secret = opts.secret;
    this._idleMs = opts.idleTimeoutMs ?? 30 * 60 * 1000;
    this._absoluteMs = opts.absoluteLifetimeMs ?? 12 * 60 * 60 * 1000;
    this._graceMs = opts.rotateGraceMs ?? 10 * 1000;
    this._touchMinMs = opts.touchMinIntervalMs ?? 60 * 1000;
    this._clock = opts.clock ?? new SystemSecurityClock();
    this._store = opts.store ?? new InMemorySessionStore();
  }

  /* ------------------------------------------------------------ */
  /* Ids                                                           */
  /* ------------------------------------------------------------ */

  /**
   * Mint an id: `base64url(random16).base64url(hmac12)`.
   * The suffix is a cheap forgery filter — a random 192-bit id already
   * can't be guessed; the HMAC additionally makes id *structure*
   * verifiable so malformed ids never reach the store.
   */
  private _mintId(): string {
    const raw = randomBytes(16).toString('base64url');
    const mac = createHmac('sha256', this._secret).update(raw).digest('base64url').slice(0, 16);
    return `${raw}.${mac}`;
  }

  private _idValid(id: string): boolean {
    const dot = id.lastIndexOf('.');
    if (dot <= 0) return false;
    const raw = id.slice(0, dot);
    const mac = id.slice(dot + 1);
    const expected = createHmac('sha256', this._secret).update(raw).digest('base64url').slice(0, 16);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Store key: HMAC(id) — store snapshots don't leak usable ids. */
  private _keyOf(id: string): string {
    return createHmac('sha256', this._secret).update(`store:${id}`).digest('hex');
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /** Create a fresh session. */
  create(data: Record<string, unknown> = {}): CreateResult {
    const id = this._mintId();
    const now = this._clock.now();
    const rec: SessionRecord = {
      id,
      key: this._keyOf(id),
      generation: 0,
      familyId: id,
      data: { ...data },
      createdAt: now,
      expiresAt: now + this._idleMs,
      absoluteExpiresAt: now + this._absoluteMs,
      rotatedUntil: null,
    };
    this._store.set(rec.key, rec);
    this._families.set(rec.familyId, rec.key);
    return { id, session: rec };
  }

  /**
   * Validate an id. Valid sessions get a sliding-expiry touch (throttled
   * by touchMinIntervalMs). Rotated ids inside grace validate as
   * ROTATED with the successor id.
   */
  validate(id: string): SessionValidation {
    if (!this._idValid(id)) {
      return { verdict: SessionVerdict.INVALID };
    }
    const key = this._keyOf(id);
    const rec = this._store.get(key);
    if (rec === null) {
      return { verdict: SessionVerdict.INVALID };
    }
    const now = this._clock.now();

    if (rec.rotatedUntil !== null) {
      if (now < rec.rotatedUntil) {
        // Grace window: the request raced the rotation; let it
        // through but tell the caller about the successor id.
        const succKey = this._successors.get(rec.key);
        const succ = succKey !== undefined ? this._store.get(succKey) : null;
        return {
          verdict: SessionVerdict.ROTATED,
          session: rec,
          currentId: succ?.id,
        };
      }
      // Old id used after grace → possible theft: kill the lineage.
      this._killFamily(rec.familyId);
      this._store.delete(key);
      this._successors.delete(key);
      return { verdict: SessionVerdict.REUSE_DETECTED };
    }

    if (now >= rec.expiresAt || now >= rec.absoluteExpiresAt) {
      this._store.delete(key);
      return { verdict: SessionVerdict.EXPIRED };
    }

    // Sliding touch — throttled to avoid rewriting hot records.
    const lastTouch = rec.expiresAt - this._idleMs;
    let effective = rec;
    if (now - lastTouch >= this._touchMinMs) {
      effective = { ...rec, expiresAt: now + this._idleMs };
      this._store.set(key, effective);
    }
    return { verdict: SessionVerdict.VALID, session: effective, currentId: id };
  }

  /**
   * Rotate: mint a successor id, carry data + creation, mark the old
   * id rotated-with-grace. Call on every privilege change (login,
   * escalation) — the fixation defense.
   */
  rotate(id: string, dataUpdates?: Record<string, unknown>): CreateResult | null {
    const v = this.validate(id);
    if (v.session === undefined || v.verdict === SessionVerdict.INVALID) {
      return null;
    }
    const old = v.session;
    const newId = this._mintId();
    const now = this._clock.now();
    const rec: SessionRecord = {
      id: newId,
      key: this._keyOf(newId),
      generation: old.generation + 1,
      familyId: old.familyId,
      data: { ...old.data, ...(dataUpdates ?? {}) },
      createdAt: old.createdAt,
      expiresAt: now + this._idleMs,
      absoluteExpiresAt: old.absoluteExpiresAt,
      rotatedUntil: null,
    };
    this._store.set(rec.key, rec);
    this._families.set(rec.familyId, rec.key);
    // Mark old rotated: valid only until grace expires.
    this._store.set(old.key, { ...old, rotatedUntil: now + this._graceMs });
    this._successors.set(old.key, rec.key);
    return { id: newId, session: rec };
  }

  /** Update session data (valid session required). */
  setData(id: string, updates: Record<string, unknown>): boolean {
    const v = this.validate(id);
    if (v.verdict !== SessionVerdict.VALID || v.session === undefined) return false;
    this._store.set(v.session.key, { ...v.session, data: { ...v.session.data, ...updates } });
    return true;
  }

  /** Explicit logout: kill this id (the rest of the family survives). */
  destroy(id: string): boolean {
    if (!this._idValid(id)) return false;
    return this._store.delete(this._keyOf(id));
  }

  /** Kill an entire lineage — used by reuse detection and admin kill. */
  private _killFamily(familyId: string): void {
    const key = this._families.get(familyId);
    if (key !== undefined) {
      this._store.delete(key);
      this._families.delete(familyId);
    }
    // Also remove any rotated ancestors that forward here.
    for (const [oldKey, succKey] of this._successors) {
      if (succKey === key || oldKey === key) {
        this._store.delete(oldKey);
        this._successors.delete(oldKey);
      }
    }
  }

  /** Remove all expired records; returns count. */
  sweep(): number {
    return this._store.sweep(this._clock.now());
  }

  get size(): number {
    return this._store.size;
  }
}
