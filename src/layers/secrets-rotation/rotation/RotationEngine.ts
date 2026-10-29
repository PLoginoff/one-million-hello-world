/**
 * Secrets Rotation — Rotation Engine
 *
 * Orchestrates key lifecycle across many secrets:
 *
 * - `rotate(secretId)` performs a normal rotation: generate → (staging) →
 *   activate new key → move prior ACTIVE to RETIRING with a dual-key grace
 *   window → auto-revoke/retire it when grace expires.
 * - `emergencyRotate(secretId)` for compromise: REVOKES the active key
 *   immediately (no grace — a compromised key must not keep validating),
 *   activates the next generation, and audits `emergency-rotated`.
 * - `validate(secretId, keyId)` answers "does this key still verify?" —
 *   true for ACTIVE keys and for RETIRING keys inside their grace window.
 * - `sweep()` drives due scheduled rotations + expires out-of-grace keys.
 * - Every lifecycle event lands in the tamper-evident {@link AuditTrail}.
 *
 * Key material generation is injectable (`generate`), so tests control
 * entropy; the engine stores material opaquely and fingerprints it (FNV-1a)
 * for audit references without logging raw bytes.
 *
 * @module SecretsRotation/Rotation
 */

import {
  KeyMaterial,
  KeyState,
  ManagedKey,
  RotationAuditEntry,
  RotationClock,
  RotationPolicy,
  RotationResult,
  ScheduledRotation,
  KeyValidationResult,
} from './RotationTypes';
import { KeyRing } from './KeyRing';
import { AuditTrail } from './AuditTrail';
import { RotationScheduler } from './RotationScheduler';

/** Default key generator — random bytes via Math.random (replaceable). */
export type KeyGenerator = (secretId: string, generation: number) => Uint8Array;

function defaultGenerator(_secretId: string, _generation: number): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function fingerprint(material: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < material.length; i++) {
    hash ^= BigInt(material[i]);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export class RotationEngine {
  private readonly _clock: RotationClock;
  private readonly _generate: KeyGenerator;
  private readonly _scheduler: RotationScheduler;
  private readonly _audit: AuditTrail;
  private readonly _rings = new Map<string, KeyRing>();
  private readonly _policies = new Map<string, RotationPolicy>();
  private _keySeq = 0;

  constructor(
    clock: RotationClock = Date.now,
    generate: KeyGenerator = defaultGenerator,
    scheduler?: RotationScheduler,
    audit?: AuditTrail
  ) {
    this._clock = clock;
    this._generate = generate;
    this._scheduler = scheduler ?? new RotationScheduler(clock);
    this._audit = audit ?? new AuditTrail(clock);
  }

  get audit(): AuditTrail {
    return this._audit;
  }

  get scheduler(): RotationScheduler {
    return this._scheduler;
  }

  /** Register a secret for managed rotation under `policy`. */
  register(policy: RotationPolicy, seedWithKey = true): KeyRing {
    if (this._rings.has(policy.secretId)) {
      throw new Error(`secret '${policy.secretId}' already registered`);
    }
    const ring = new KeyRing(policy.secretId, this._clock);
    this._rings.set(policy.secretId, ring);
    this._policies.set(policy.secretId, policy);
    this._scheduler.register(policy);
    if (seedWithKey) {
      this._generateAndStage(policy.secretId);
      const staged = ring.keys.find((k) => k.state === KeyState.STAGING);
      if (staged) this._activate(ring, staged, 'initial seed');
    }
    return ring;
  }

  ringFor(secretId: string): KeyRing {
    const ring = this._rings.get(secretId);
    if (!ring) throw new Error(`secret '${secretId}' not registered`);
    return ring;
  }

  /** All valid-for-verification keys for a secret right now. */
  validKeys(secretId: string): ReadonlyArray<ManagedKey> {
    const ring = this.ringFor(secretId);
    return ring.keys.filter((k) => ring.validate(k.material.keyId).valid);
  }

  /** The key a caller should use for NEW operations (the ACTIVE one). */
  activeKey(secretId: string): ManagedKey | undefined {
    return this.ringFor(secretId).active();
  }

  /** Validate a key by id — dual-key semantics (RETIRING in grace = valid). */
  validate(secretId: string, keyId: string): KeyValidationResult {
    return this.ringFor(secretId).validate(keyId);
  }

  /**
   * Normal rotation for a secret.
   *
   * Steps: generate → stage → activate (after stagingMs on the clock) →
   * retire previous ACTIVE with grace. Returns the new key + the retiring
   * key so callers know the dual-key window is open.
   */
  rotate(secretId: string, actor = 'scheduler'): RotationResult {
    const policy = this._policyFor(secretId);
    const ring = this.ringFor(secretId);

    const staged = this._generateAndStage(secretId);
    // Retire the incumbent BEFORE activating the successor — the ring enforces
    // the single-ACTIVE invariant, so the old key must already be RETIRING.
    const retiring = ring.active();
    if (retiring) {
      ring.transition(retiring.material.keyId, KeyState.RETIRING, { graceMs: policy.graceMs });
      this._audit.append(
        secretId,
        retiring.material.keyId,
        retiring.material.generation,
        'retiring',
        `grace ${policy.graceMs}ms`,
        actor
      );
    }
    this._activate(ring, staged, `rotation by ${actor}`);
    this._scheduler.reschedule(secretId);
    return {
      secretId,
      newKeyId: staged.material.keyId,
      newGeneration: staged.material.generation,
      retiredKeyId: retiring?.material.keyId,
      dualKeyWindowEndsAt: retiring?.validUntil,
      emergency: false,
    };
  }

  /**
   * Emergency rotation for a compromised secret: the active key is REVOKED
   * immediately (no dual-key grace — a compromised key must never validate
   * again), the next generation is generated+activated, and the event is
   * audited as `emergency-rotated`.
   */
  emergencyRotate(secretId: string, reason: string, actor = 'operator'): RotationResult {
    const ring = this.ringFor(secretId);
    const active = ring.active();
    if (active) {
      ring.transition(active.material.keyId, KeyState.REVOKED, { reason });
      this._audit.append(secretId, active.material.keyId, active.material.generation, 'revoked', reason, actor);
    }
    // Also revoke any in-flight STAGING key — its material may share the
    // compromised generation's entropy context.
    const staged = ring.keys.find((k) => k.state === KeyState.STAGING);
    if (staged) {
      ring.transition(staged.material.keyId, KeyState.REVOKED, { reason });
      this._audit.append(secretId, staged.material.keyId, staged.material.generation, 'revoked', reason, actor);
    }
    const next = this._generateAndStage(secretId);
    this._activate(ring, next, `emergency rotation: ${reason}`);
    this._audit.append(secretId, next.material.keyId, next.material.generation, 'emergency-rotated', reason, actor);
    this._scheduler.reschedule(secretId);
    return {
      secretId,
      newKeyId: next.material.keyId,
      newGeneration: next.material.generation,
      retiredKeyId: undefined,
      dualKeyWindowEndsAt: undefined,
      emergency: true,
    };
  }

  /** Retire a RETIRING key explicitly (early end to its grace window). */
  retireNow(secretId: string, keyId: string, actor = 'operator'): void {
    const ring = this.ringFor(secretId);
    const key = ring.get(keyId);
    if (!key) throw new Error(`unknown key '${keyId}'`);
    ring.transition(keyId, KeyState.RETIRED);
    this._audit.append(secretId, keyId, key.material.generation, 'retired', 'manual retire', actor);
  }

  /** Revoke any key immediately (compromise of a specific generation). */
  revoke(secretId: string, keyId: string, reason: string, actor = 'operator'): void {
    const ring = this.ringFor(secretId);
    const key = ring.get(keyId);
    if (!key) throw new Error(`unknown key '${keyId}'`);
    ring.transition(keyId, KeyState.REVOKED, { reason });
    this._audit.append(secretId, keyId, key.material.generation, 'revoked', reason, actor);
  }

  /**
   * Drive scheduled work: fire due interval rotations, rotate keys past
   * `maxKeyAgeMs`, and expire RETIRING keys whose grace ended (retire or
   * auto-revoke per policy). Returns everything it did for observability.
   */
  sweep(): { rotated: RotationResult[]; expired: string[]; maxAgeRotated: RotationResult[] } {
    const rotated: RotationResult[] = [];
    const expired: string[] = [];
    const maxAgeRotated: RotationResult[] = [];

    // Interval-due rotations.
    const due: ScheduledRotation[] = this._scheduler.due();
    for (const d of due) {
      try {
        rotated.push(this.rotate(d.secretId, 'scheduled'));
        this._audit.append(d.secretId, '', -1, 'scheduled-fired', `due at ${d.dueAt}`, 'scheduler');
      } catch (e) {
        this._audit.append(d.secretId, '', -1, 'rotation-skipped', e instanceof Error ? e.message : String(e), 'scheduler');
      }
    }

    // Max-age enforcement (fires regardless of interval).
    for (const [secretId, policy] of this._policies) {
      if (policy.maxKeyAgeMs === undefined) continue;
      const ring = this._rings.get(secretId);
      if (!ring) continue;
      for (const key of ring.olderThan(policy.maxKeyAgeMs)) {
        if (key.state !== KeyState.ACTIVE) continue;
        try {
          maxAgeRotated.push(this.rotate(secretId, 'max-age'));
          this._audit.append(secretId, key.material.keyId, key.material.generation, 'expired', `age > ${policy.maxKeyAgeMs}ms`, 'scheduler');
        } catch (e) {
          this._audit.append(secretId, key.material.keyId, key.material.generation, 'rotation-skipped', e instanceof Error ? e.message : String(e), 'scheduler');
        }
      }
    }

    // Expire RETIRING keys past their grace window.
    for (const [secretId, ring] of this._rings) {
      const policy = this._policies.get(secretId);
      const autoRevoke = policy?.autoRevokeOnGraceEnd ?? true;
      for (const key of ring.pastGrace()) {
        const target = autoRevoke ? KeyState.REVOKED : KeyState.RETIRED;
        ring.transition(key.material.keyId, target, {
          reason: autoRevoke ? 'grace window expired (auto-revoke)' : 'grace window expired',
        });
        expired.push(key.material.keyId);
        this._audit.append(
          secretId,
          key.material.keyId,
          key.material.generation,
          autoRevoke ? 'revoked' : 'retired',
          'grace window expired',
          'sweeper'
        );
      }
    }
    return { rotated, expired, maxAgeRotated };
  }

  /** Audit entries for a secret. */
  auditFor(secretId: string): ReadonlyArray<RotationAuditEntry> {
    return this._audit.forSecret(secretId);
  }

  // ------------------------------------------------------------------ private

  private _policyFor(secretId: string): RotationPolicy {
    const p = this._policies.get(secretId);
    if (!p) throw new Error(`secret '${secretId}' not registered`);
    return p;
  }

  private _generateAndStage(secretId: string): ManagedKey {
    const ring = this.ringFor(secretId);
    const generation = ring.highestGeneration + 1;
    const material = this._generate(secretId, generation);
    const keyMaterial: KeyMaterial = {
      keyId: `${secretId}-k${generation}-${this._keySeq++}`,
      secretId,
      generation,
      material,
      fingerprint: fingerprint(material),
    };
    const managed = ring.add(keyMaterial);
    this._audit.append(secretId, keyMaterial.keyId, generation, 'generated', 'new material', 'engine');
    ring.transition(keyMaterial.keyId, KeyState.STAGING);
    this._audit.append(secretId, keyMaterial.keyId, generation, 'staged', 'pre-distribution', 'engine');
    return managed;
  }

  private _activate(ring: KeyRing, key: ManagedKey, reason: string): void {
    ring.transition(key.material.keyId, KeyState.ACTIVE);
    this._audit.append(ring.secretId, key.material.keyId, key.material.generation, 'activated', reason, 'engine');
  }
}
