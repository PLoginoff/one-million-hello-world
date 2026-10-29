/**
 * Secrets Rotation — Engine Types
 *
 * Types for the key/secret rotation engine: key material lifecycle states,
 * rotation schedules, dual-key validity windows, the audit trail and
 * revocation/emergency-rotation semantics.
 *
 * @module SecretsRotation/Rotation
 */

/** Injectable clock — epoch ms. */
export type RotationClock = () => number;

/**
 * Lifecycle of one generation of key material.
 *
 *   GENERATING → STAGING → ACTIVE → RETIRING → RETIRED
 *                    ↘ REVOKED (from any non-terminal state)
 *
 * - GENERATING: material is being produced (entropy/KMS call).
 * - STAGING:    material exists but is NOT yet valid for new operations;
 *               used to pre-distribute to consumers before cutover.
 * - ACTIVE:     valid for new operations; the current signing/encrypting key.
 * - RETIRING:   in the grace window — no new operations but still validates
 *               artifacts signed/encrypted while it was ACTIVE (dual-key).
 * - RETIRED:    fully invalid; retained only for audit.
 * - REVOKED:    emergency-invalidated (compromise) — invalid immediately,
 *               no grace.
 */
export enum KeyState {
  GENERATING = 'GENERATING',
  STAGING = 'STAGING',
  ACTIVE = 'ACTIVE',
  RETIRING = 'RETIRING',
  RETIRED = 'RETIRED',
  REVOKED = 'REVOKED',
}

export const KEY_TRANSITIONS: Readonly<Record<KeyState, ReadonlyArray<KeyState>>> = {
  [KeyState.GENERATING]: [KeyState.STAGING, KeyState.REVOKED],
  [KeyState.STAGING]: [KeyState.ACTIVE, KeyState.REVOKED],
  [KeyState.ACTIVE]: [KeyState.RETIRING, KeyState.REVOKED],
  [KeyState.RETIRING]: [KeyState.RETIRED, KeyState.REVOKED],
  [KeyState.RETIRED]: [KeyState.REVOKED],
  [KeyState.REVOKED]: [],
};

/** Opaque key material (the engine never interprets the bytes). */
export interface KeyMaterial {
  readonly keyId: string;
  readonly secretId: string;
  readonly generation: number;
  readonly material: Uint8Array;
  readonly fingerprint: string;
}

/** A managed secret's rotation policy. */
export interface RotationPolicy {
  readonly secretId: string;
  /** Cron-like interval between automatic rotations (ms). */
  readonly intervalMs: number;
  /**
   * Grace period (ms) after a new key activates during which the retiring
   * key remains valid for VERIFICATION only — the dual-key window.
   */
  readonly graceMs: number;
  /** Automatically revoke the retiring key when grace expires (default true). */
  readonly autoRevokeOnGraceEnd?: boolean;
  /** Optional hard TTL on any key: force-rotate regardless of schedule (ms). */
  readonly maxKeyAgeMs?: number;
  /** How long STAGING lasts before cutover (default 0 = activate immediately). */
  readonly stagingMs?: number;
}

/** A rotation audit entry — append-only record of every lifecycle event. */
export interface RotationAuditEntry {
  readonly seq: number;
  readonly at: number;
  readonly secretId: string;
  readonly keyId: string;
  readonly generation: number;
  readonly event:
    | 'generated'
    | 'staged'
    | 'activated'
    | 'retiring'
    | 'retired'
    | 'revoked'
    | 'expired'
    | 'emergency-rotated'
    | 'scheduled-fired'
    | 'rotation-skipped';
  readonly reason: string;
  readonly actor: string;
}

/** Internal record for one generation of a secret's key. */
export interface ManagedKey {
  readonly material: KeyMaterial;
  state: KeyState;
  readonly generatedAt: number;
  stagedAt?: number;
  activatedAt?: number;
  retiringAt?: number;
  /** Absolute end of dual-key validity (activating generation + grace). */
  validUntil?: number;
  retiredAt?: number;
  revokedAt?: number;
  revokeReason?: string;
}

/** Result of a validity check against a secret's key ring. */
export interface KeyValidationResult {
  readonly valid: boolean;
  readonly keyId?: string;
  readonly generation?: number;
  readonly state?: KeyState;
  readonly reason: string;
}

/** A scheduled rotation event returned by the scheduler. */
export interface ScheduledRotation {
  readonly secretId: string;
  readonly dueAt: number;
  readonly kind: 'interval' | 'max-age' | 'emergency';
}

/** Summary of one completed rotation. */
export interface RotationResult {
  readonly secretId: string;
  readonly newKeyId: string;
  readonly newGeneration: number;
  readonly retiredKeyId?: string;
  readonly dualKeyWindowEndsAt?: number;
  readonly emergency: boolean;
}
