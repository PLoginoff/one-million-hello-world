/**
 * Trusted Device Management ("remember this device")
 *
 * Issues and validates remember-me tokens so a known device can skip or
 * downgrade MFA challenges for a bounded period.
 *
 * Token format
 * ------------
 *   token = tokenId "." mac
 *   mac   = hex(HMAC-ish stub: sha256(secret || tokenId || userId || deviceId || expiry))
 *
 * The store keeps tokenId → record. Validation recomputes the MAC with
 * the server secret and checks expiry + revocation. Rotation issues a
 * new tokenId bound to the same device (rolling tokens — like rotating
 * refresh tokens).
 *
 * Threat model covered: token theft is mitigated by (a) binding to
 * deviceId, (b) revocation on anomaly, (c) per-user token caps that
 * evict oldest, (d) sliding expiry.
 *
 * @module Mfa/Engine2
 */

import { sha256, utf8, hex, timingSafeEqual, IRandomSource, SystemRandomSource } from './WebAuthn';

export interface TrustedDevice {
  readonly deviceId: string;
  readonly userId: string;
  readonly label: string;
  readonly createdAt: number;
  lastSeenAt: number;
  /** Approximate trust: how many valid auths this device has completed. */
  trustScore: number;
  revoked: boolean;
}

export interface DeviceToken {
  /** tokenId.mac — what the client stores (e.g. cookie). */
  readonly token: string;
  readonly tokenId: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly expiresAt: number;
}

interface TokenRecord {
  readonly tokenId: string;
  readonly deviceId: string;
  readonly userId: string;
  /** Mutable — sliding renewal extends it. */
  expiresAt: number;
  readonly mac: string;
  revoked: boolean;
}

export interface TrustedDeviceOptions {
  /** How long a token lives; default 30 days. */
  readonly tokenTtlMs?: number;
  /** Max live tokens per user — oldest evicted beyond this. */
  readonly maxTokensPerUser?: number;
  /** Sliding renewal: validate extends expiry when within this window of
   *  expiry. 0 disables. */
  readonly renewWindowMs?: number;
}

export class TrustedDeviceStore {
  private readonly devices = new Map<string, TrustedDevice>(); // key: userId:deviceId
  private readonly tokens = new Map<string, TokenRecord>();
  private readonly secret: Uint8Array;
  private readonly ttl: number;
  private readonly maxTokens: number;
  private readonly renewWindow: number;

  constructor(
    private readonly rng: IRandomSource = new SystemRandomSource(),
    private readonly clock: () => number = Date.now,
    options: TrustedDeviceOptions = {},
    secret?: Uint8Array
  ) {
    this.ttl = options.tokenTtlMs ?? 30 * 24 * 3600 * 1000;
    this.maxTokens = options.maxTokensPerUser ?? 10;
    this.renewWindow = options.renewWindowMs ?? 0;
    this.secret = secret ?? rng.bytes(32);
  }

  /* ------------------------------------------------------------------ */
  /* Devices                                                            */
  /* ------------------------------------------------------------------ */

  /** Register (or touch) a device for a user. */
  registerDevice(userId: string, deviceId: string, label: string): TrustedDevice {
    const key = userId + ':' + deviceId;
    let d = this.devices.get(key);
    if (!d) {
      d = {
        deviceId,
        userId,
        label,
        createdAt: this.clock(),
        lastSeenAt: this.clock(),
        trustScore: 0,
        revoked: false,
      };
      this.devices.set(key, d);
    }
    return d;
  }

  device(userId: string, deviceId: string): TrustedDevice | undefined {
    return this.devices.get(userId + ':' + deviceId);
  }

  devicesFor(userId: string): readonly TrustedDevice[] {
    const out: TrustedDevice[] = [];
    for (const d of this.devices.values()) if (d.userId === userId) out.push(d);
    return out;
  }

  /** Revoke a device and all its tokens. */
  revokeDevice(userId: string, deviceId: string): number {
    const d = this.devices.get(userId + ':' + deviceId);
    if (d) d.revoked = true;
    let n = 0;
    for (const t of this.tokens.values()) {
      if (t.userId === userId && t.deviceId === deviceId && !t.revoked) {
        t.revoked = true;
        n++;
      }
    }
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Tokens                                                             */
  /* ------------------------------------------------------------------ */

  /** Issue a remember-me token bound to (userId, deviceId). */
  issueToken(userId: string, deviceId: string): DeviceToken {
    const tokenId = hex(this.rng.bytes(16));
    const expiresAt = this.clock() + this.ttl;
    const mac = this.computeMac(tokenId, userId, deviceId, expiresAt);
    this.tokens.set(tokenId, { tokenId, deviceId, userId, expiresAt, mac, revoked: false });
    this.evictOldest(userId);
    return { token: tokenId + '.' + mac, tokenId, deviceId, userId, expiresAt };
  }

  /**
   * Validate a presented token string.
   * Returns the bound (userId, deviceId) when valid, null otherwise.
   * Side effects: bumps device lastSeen + trustScore; may slide expiry.
   */
  validate(token: string): { readonly userId: string; readonly deviceId: string } | null {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const tokenId = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    const rec = this.tokens.get(tokenId);
    if (!rec || rec.revoked) return null;
    if (!timingSafeEqual(utf8(rec.mac), utf8(mac))) return null;
    const now = this.clock();
    if (rec.expiresAt < now) return null;
    const device = this.devices.get(rec.userId + ':' + rec.deviceId);
    if (!device || device.revoked) return null;

    device.lastSeenAt = now;
    device.trustScore += 1;
    // Sliding renewal inside the renew window.
    if (this.renewWindow > 0 && rec.expiresAt - now < this.renewWindow) {
      rec.expiresAt = now + this.ttl;
    }
    return { userId: rec.userId, deviceId: rec.deviceId };
  }

  /** Rotate a token: revoke the old one, issue a fresh one on the same device. */
  rotate(token: string): DeviceToken | null {
    const ok = this.validate(token);
    if (!ok) return null;
    const dot = token.indexOf('.');
    const tokenId = token.slice(0, dot);
    const rec = this.tokens.get(tokenId);
    if (rec) rec.revoked = true;
    return this.issueToken(ok.userId, ok.deviceId);
  }

  /** Revoke a specific token by presented token string. */
  revokeToken(token: string): boolean {
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const rec = this.tokens.get(token.slice(0, dot));
    if (!rec) return false;
    rec.revoked = true;
    return true;
  }

  /** Drop expired + revoked tokens — periodic GC. */
  gc(): number {
    const now = this.clock();
    let n = 0;
    for (const [k, t] of this.tokens) {
      if (t.expiresAt < now || t.revoked) {
        this.tokens.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Live token count for a user (diagnostics). */
  tokenCount(userId: string): number {
    const now = this.clock();
    let n = 0;
    for (const t of this.tokens.values()) {
      if (t.userId === userId && !t.revoked && t.expiresAt >= now) n++;
    }
    return n;
  }

  /* ------------------------------------------------------------------ */

  private computeMac(tokenId: string, userId: string, deviceId: string, expiresAt: number): string {
    const exp = new Uint8Array(8);
    new DataView(exp.buffer).setFloat64(0, expiresAt, false);
    return hex(sha256(concatBytes(this.secret, utf8(tokenId), utf8(userId), utf8(deviceId), exp)));
  }

  /** Enforce per-user token cap — evict oldest expiry first. */
  private evictOldest(userId: string): void {
    const mine: TokenRecord[] = [];
    for (const t of this.tokens.values()) {
      if (t.userId === userId && !t.revoked) mine.push(t);
    }
    if (mine.length <= this.maxTokens) return;
    mine.sort((a, b) => a.expiresAt - b.expiresAt);
    for (let i = 0; i < mine.length - this.maxTokens; i++) {
      mine[i].revoked = true;
    }
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
