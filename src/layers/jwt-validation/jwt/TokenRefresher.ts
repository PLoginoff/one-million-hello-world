/**
 * TokenRefresher — issues and rotates access/refresh token pairs.
 *
 * Access tokens are HS256-signed JWTs with short expiry; refresh tokens
 * are opaque random strings tracked server-side with rotation-on-use.
 */

import { randomBytes, createHash } from 'crypto';
import { signHs256, VerificationKey } from './JwtVerifier';
import { JwtTokenError, RefreshResult, TokenPair } from './types';
import { TokenBlacklist } from './TokenBlacklist';
import { KeyRotationStrategy } from './KeyRotationStrategy';

export interface RefreshTokenRecord {
  /** SHA-256 of the refresh token (never store raw). */
  hash: string;
  subject: string;
  issuedAtMs: number;
  expiresAtMs: number;
  /** Generation counter — increments on each rotation. */
  generation: number;
  /** JTI of the access token issued alongside. */
  accessJti?: string;
  used: boolean;
  familyId: string;
}

export interface TokenRefresherConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  issuer?: string;
  audience?: string | string[];
  /** Detect refresh-token reuse (RFC 6819 theft detection). */
  detectReuse?: boolean;
}

interface StoredFamily {
  familyId: string;
  records: RefreshTokenRecord[];
}

export class TokenRefresher {
  private readonly config: TokenRefresherConfig;
  private readonly rotation: KeyRotationStrategy;
  private readonly blacklist: TokenBlacklist;
  private readonly now: () => number;
  private families = new Map<string, StoredFamily>();
  private byHash = new Map<string, { familyId: string; record: RefreshTokenRecord }>();

  constructor(
    config: Partial<TokenRefresherConfig> = {},
    opts: { now?: () => number; rotation?: KeyRotationStrategy; blacklist?: TokenBlacklist } = {}
  ) {
    this.config = {
      accessTokenTtlSeconds: 900, // 15 min
      refreshTokenTtlSeconds: 7 * 24 * 60 * 60, // 7 days
      detectReuse: true,
      ...config,
    };
    this.now = opts.now ?? (() => Date.now());
    this.rotation = opts.rotation ?? new KeyRotationStrategy();
    this.blacklist = opts.blacklist ?? new TokenBlacklist({ now: this.now });
  }

  /** Issue a fresh pair for a subject (e.g. after login). */
  issue(subject: string, extraClaims?: Record<string, unknown>): TokenPair {
    const familyId = `fam-${randomBytes(8).toString('hex')}`;
    return this.mint(subject, familyId, 0, extraClaims);
  }

  /**
   * Exchange a refresh token for a new pair. Rotates the refresh token;
   * the old one is marked used and (if reuse-detection enabled) further
   * use revokes the whole family.
   */
  refresh(refreshToken: string): RefreshResult {
    const hash = this.hashToken(refreshToken);
    const entry = this.byHash.get(hash);
    if (!entry) {
      return { rotated: false, error: this.err('revoked', 'Refresh token unknown') };
    }
    const { familyId, record } = entry;
    const nowMs = this.now();

    if (record.used) {
      if (this.config.detectReuse) {
        this.revokeFamily(familyId);
        return {
          rotated: false,
          error: this.err('revoked', 'Refresh token reuse detected — family revoked', { familyId }),
        };
      }
      return { rotated: false, error: this.err('revoked', 'Refresh token already used') };
    }
    if (record.expiresAtMs <= nowMs) {
      return { rotated: false, error: this.err('expired', 'Refresh token expired') };
    }

    record.used = true;
    // Revoke the paired access token's jti so the old access token dies too.
    if (record.accessJti) {
      this.blacklist.revokeJti(record.accessJti, Math.floor(record.expiresAtMs / 1000), 'rotated');
    }

    const pair = this.mint(record.subject, familyId, record.generation + 1);
    return { rotated: true, pair };
  }

  /** Revoke all refresh tokens in a family (logout / theft response). */
  revokeFamily(familyId: string): number {
    const fam = this.families.get(familyId);
    if (!fam) return 0;
    let count = 0;
    for (const r of fam.records) {
      this.byHash.delete(r.hash);
      count++;
    }
    this.families.delete(familyId);
    return count;
  }

  /** Family state (for diagnostics). */
  familyInfo(familyId: string): { generations: number; activeTokens: number } | null {
    const fam = this.families.get(familyId);
    if (!fam) return null;
    const nowMs = this.now();
    return {
      generations: fam.records.length,
      activeTokens: fam.records.filter((r) => !r.used && r.expiresAtMs > nowMs).length,
    };
  }

  /** Access to the underlying blacklist. */
  get tokenBlacklist(): TokenBlacklist {
    return this.blacklist;
  }

  /** Access to the key rotation strategy. */
  get keyRotation(): KeyRotationStrategy {
    return this.rotation;
  }

  /** The verification key to use for issued access tokens. */
  verificationKey(): VerificationKey {
    const active = this.rotation.ensureActive();
    return { kind: 'secret', secret: active.secret };
  }

  /* ---------------------------------------------------------------- */

  private mint(
    subject: string,
    familyId: string,
    generation: number,
    extraClaims?: Record<string, unknown>
  ): TokenPair {
    const nowMs = this.now();
    const nowSec = Math.floor(nowMs / 1000);
    const accessExp = nowSec + this.config.accessTokenTtlSeconds;
    const refreshExpMs = nowMs + this.config.refreshTokenTtlSeconds * 1000;
    const active = this.rotation.ensureActive();

    const jti = `jti-${randomBytes(12).toString('hex')}`;
    const claims: Record<string, unknown> = {
      sub: subject,
      iat: nowSec,
      exp: accessExp,
      jti,
      ...(this.config.issuer ? { iss: this.config.issuer } : {}),
      ...(this.config.audience ? { aud: this.config.audience } : {}),
      ...(extraClaims ?? {}),
    };
    const accessToken = signHs256(claims, active.secret, { kid: active.kid });
    const refreshToken = `rft-${randomBytes(32).toString('hex')}`;

    const record: RefreshTokenRecord = {
      hash: this.hashToken(refreshToken),
      subject,
      issuedAtMs: nowMs,
      expiresAtMs: refreshExpMs,
      generation,
      accessJti: jti,
      used: false,
      familyId,
    };

    let fam = this.families.get(familyId);
    if (!fam) {
      fam = { familyId, records: [] };
      this.families.set(familyId, fam);
    }
    fam.records.push(record);
    this.byHash.set(record.hash, { familyId, record });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExp * 1000,
      refreshTokenExpiresAt: refreshExpMs,
      tokenType: 'Bearer',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private err(
    code: 'revoked' | 'expired',
    message: string,
    details?: Record<string, unknown>
  ): JwtTokenError {
    return new JwtTokenError(code, message, details);
  }
}
