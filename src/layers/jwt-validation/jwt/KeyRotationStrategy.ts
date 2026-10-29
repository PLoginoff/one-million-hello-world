/**
 * KeyRotationStrategy — manage signing key rotation for HS256 issuers.
 *
 * Active key signs new tokens; retired keys remain usable for verification
 * until their grace period elapses.
 */

import { randomBytes } from 'crypto';
import { KeyRotationConfig } from './types';

export interface SigningKey {
  kid: string;
  secret: Buffer;
  createdAt: number;
  status: 'active' | 'retired';
  retiredAt?: number;
}

export class KeyRotationStrategy {
  private readonly config: KeyRotationConfig;
  private keys: SigningKey[] = [];
  private readonly now: () => number;
  private readonly secretLength: number;

  constructor(
    config: Partial<KeyRotationConfig> = {},
    opts: { now?: () => number; secretLength?: number } = {}
  ) {
    this.config = {
      maxKeyAgeMs: 24 * 60 * 60 * 1000, // 24h
      retirementGraceMs: 60 * 60 * 1000, // 1h grace for verification
      maxRetiredKeys: 5,
      ...config,
    };
    this.now = opts.now ?? (() => Date.now());
    this.secretLength = opts.secretLength ?? 32;
  }

  /** Ensure an active key exists; generate one if needed. */
  ensureActive(): SigningKey {
    const active = this.activeKey();
    if (active) return active;
    return this.generateKey();
  }

  /** Current active key, or undefined if none exists. */
  activeKey(): SigningKey | undefined {
    return this.keys.find((k) => k.status === 'active');
  }

  /** Generate and set a new active key; retires the old one. */
  generateKey(kid?: string): SigningKey {
    const now = this.now();
    const previous = this.activeKey();
    if (previous) {
      previous.status = 'retired';
      previous.retiredAt = now;
    }
    const key: SigningKey = {
      kid: kid ?? `key-${now.toString(36)}-${randomBytes(4).toString('hex')}`,
      secret: randomBytes(this.secretLength),
      createdAt: now,
      status: 'active',
    };
    this.keys.push(key);
    this.prune();
    return key;
  }

  /** Rotate if the active key has exceeded max age. Returns true if rotated. */
  rotateIfDue(): boolean {
    const active = this.activeKey();
    if (!active) {
      this.generateKey();
      return true;
    }
    if (this.now() - active.createdAt >= this.config.maxKeyAgeMs) {
      this.generateKey();
      return true;
    }
    return false;
  }

  /** Force rotation regardless of age. Returns the new key. */
  forceRotate(kid?: string): SigningKey {
    return this.generateKey(kid);
  }

  /**
   * Resolve a signing/verification key by kid.
   * - active keys: always valid.
   * - retired keys: valid only within grace period.
   */
  resolve(kid: string): SigningKey | null {
    const now = this.now();
    const key = this.keys.find((k) => k.kid === kid);
    if (!key) return null;
    if (key.status === 'active') return key;
    if (key.retiredAt !== undefined && now - key.retiredAt <= this.config.retirementGraceMs) {
      return key;
    }
    return null;
  }

  /** All keys that can still verify tokens (active + in-grace retired). */
  verifiableKeys(): SigningKey[] {
    const now = this.now();
    return this.keys.filter(
      (k) =>
        k.status === 'active' ||
        (k.retiredAt !== undefined && now - k.retiredAt <= this.config.retirementGraceMs)
    );
  }

  /** Remove expired retired keys and cap retired count. */
  private prune(): void {
    const now = this.now();
    // Drop retired keys past grace
    this.keys = this.keys.filter((k) => {
      if (k.status === 'active') return true;
      return k.retiredAt !== undefined && now - k.retiredAt <= this.config.retirementGraceMs;
    });
    // Cap retired count
    const retired = this.keys.filter((k) => k.status === 'retired');
    if (retired.length > this.config.maxRetiredKeys) {
      const excess = retired.length - this.config.maxRetiredKeys;
      let removed = 0;
      this.keys = this.keys.filter((k) => {
        if (k.status === 'retired' && removed < excess) {
          removed++;
          return false;
        }
        return true;
      });
    }
  }

  /** Snapshot of the key ring (for diagnostics — secrets redacted). */
  describe(): Array<{ kid: string; status: string; ageMs: number }> {
    const now = this.now();
    return this.keys.map((k) => ({
      kid: k.kid,
      status: k.status,
      ageMs: now - k.createdAt,
    }));
  }
}
