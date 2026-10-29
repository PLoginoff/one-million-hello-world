/**
 * Secrets Rotation — Key Ring
 *
 * Per-secret store of key generations with guarded lifecycle transitions and
 * dual-key validity semantics:
 *
 * - At most ONE generation may be ACTIVE at a time (the signing/encryption
 *   key). At most one may be RETIRING (the grace window) — enforcing this in
 *   the ring is what makes the "old+new both verify" window well-defined.
 * - `validate(keyId)` returns true iff the key is ACTIVE, or RETIRING and
 *   still inside its `validUntil` grace window. RETIRED/REVOKED never
 *   validate — revocation has no grace by design.
 * - All transitions go through {@link KeyState} guards: GENERATING→STAGING→
 *   ACTIVE→RETIRING→RETIRED, with REVOKED reachable from any non-terminal
 *   state. Illegal transitions throw — a key can't skip STAGING or un-retire.
 *
 * @module SecretsRotation/Rotation
 */

import {
  KEY_TRANSITIONS,
  KeyMaterial,
  KeyState,
  ManagedKey,
  RotationClock,
  KeyValidationResult,
} from './RotationTypes';

export class InvalidKeyTransition extends Error {
  constructor(keyId: string, from: KeyState, to: KeyState) {
    super(`invalid key transition ${keyId}: ${from} → ${to}`);
    this.name = 'InvalidKeyTransition';
  }
}

export class KeyRing {
  private readonly _secretId: string;
  private readonly _clock: RotationClock;
  /** Generation → managed key. Generations are append-only. */
  private readonly _keys = new Map<number, ManagedKey>();
  private readonly _byKeyId = new Map<string, ManagedKey>();
  private _highestGeneration = 0;

  constructor(secretId: string, clock: RotationClock = Date.now) {
    this._secretId = secretId;
    this._clock = clock;
  }

  get secretId(): string {
    return this._secretId;
  }

  /** All managed keys, generation order. */
  get keys(): ReadonlyArray<ManagedKey> {
    return [...this._keys.values()].sort((a, b) => a.material.generation - b.material.generation);
  }

  get highestGeneration(): number {
    return this._highestGeneration;
  }

  /** The single ACTIVE key, if any. */
  active(): ManagedKey | undefined {
    for (const k of this._keys.values()) {
      if (k.state === KeyState.ACTIVE) return k;
    }
    return undefined;
  }

  /** The single RETIRING key (inside or past its grace window), if any. */
  retiring(): ManagedKey | undefined {
    for (const k of this._keys.values()) {
      if (k.state === KeyState.RETIRING) return k;
    }
    return undefined;
  }

  /** Fetch a managed key by generation or keyId. */
  get(idOrGeneration: string | number): ManagedKey | undefined {
    if (typeof idOrGeneration === 'number') return this._keys.get(idOrGeneration);
    return this._byKeyId.get(idOrGeneration);
  }

  /** Insert freshly-generated material in GENERATING state. */
  add(material: KeyMaterial): ManagedKey {
    if (material.generation <= this._highestGeneration) {
      throw new RangeError(
        `generation ${material.generation} must exceed current highest ${this._highestGeneration}`
      );
    }
    if (this._byKeyId.has(material.keyId)) {
      throw new Error(`keyId '${material.keyId}' already exists`);
    }
    const managed: ManagedKey = {
      material,
      state: KeyState.GENERATING,
      generatedAt: this._clock(),
    };
    this._keys.set(material.generation, managed);
    this._byKeyId.set(material.keyId, managed);
    this._highestGeneration = material.generation;
    return managed;
  }

  /**
   * Guarded transition. Enforces the single-ACTIVE/single-RETIRING
   * invariants and stamps the relevant timestamps.
   */
  transition(keyId: string, to: KeyState, opts: { graceMs?: number; reason?: string } = {}): ManagedKey {
    const key = this._byKeyId.get(keyId);
    if (!key) throw new Error(`unknown key '${keyId}'`);
    const allowed = KEY_TRANSITIONS[key.state];
    if (!allowed.includes(to)) {
      throw new InvalidKeyTransition(keyId, key.state, to);
    }

    // Single-ACTIVE invariant.
    if (to === KeyState.ACTIVE) {
      const current = this.active();
      if (current && current.material.keyId !== keyId) {
        throw new Error(
          `cannot activate ${keyId}: ${current.material.keyId} already ACTIVE — retire it first`
        );
      }
    }
    // Single-RETIRING invariant.
    if (to === KeyState.RETIRING) {
      const current = this.retiring();
      if (current && current.material.keyId !== keyId) {
        throw new Error(
          `cannot retire ${keyId}: ${current.material.keyId} already RETIRING — complete its retirement first`
        );
      }
    }

    const now = this._clock();
    key.state = to;
    switch (to) {
      case KeyState.STAGING:
        key.stagedAt = now;
        break;
      case KeyState.ACTIVE:
        key.activatedAt = now;
        break;
      case KeyState.RETIRING:
        key.retiringAt = now;
        key.validUntil = now + (opts.graceMs ?? 0);
        break;
      case KeyState.RETIRED:
        key.retiredAt = now;
        break;
      case KeyState.REVOKED:
        key.revokedAt = now;
        key.revokeReason = opts.reason;
        key.validUntil = now; // no grace on revocation
        break;
      case KeyState.GENERATING:
        break;
    }
    return key;
  }

  /**
   * Is `keyId` valid for VERIFICATION right now? True iff ACTIVE, or RETIRING
   * and still inside its grace window. Note: only ACTIVE keys may sign/
   * encrypt — see {@link canOperate}.
   */
  validate(keyId: string): KeyValidationResult {
    const key = this._byKeyId.get(keyId);
    if (!key) {
      return { valid: false, reason: `unknown key '${keyId}'` };
    }
    const now = this._clock();
    switch (key.state) {
      case KeyState.ACTIVE:
        return { valid: true, keyId, generation: key.material.generation, state: key.state, reason: 'active' };
      case KeyState.RETIRING: {
        const inside = key.validUntil !== undefined && now <= key.validUntil;
        return inside
          ? { valid: true, keyId, generation: key.material.generation, state: key.state, reason: 'within grace window' }
          : { valid: false, keyId, generation: key.material.generation, state: key.state, reason: 'grace window expired' };
      }
      case KeyState.REVOKED:
        return { valid: false, keyId, generation: key.material.generation, state: key.state, reason: `revoked: ${key.revokeReason ?? 'unspecified'}` };
      case KeyState.RETIRED:
        return { valid: false, keyId, generation: key.material.generation, state: key.state, reason: 'retired' };
      case KeyState.GENERATING:
      case KeyState.STAGING:
        return { valid: false, keyId, generation: key.material.generation, state: key.state, reason: `not yet active (${key.state})` };
    }
  }

  /**
   * Is `keyId` allowed to perform NEW operations (sign/encrypt)? Only ACTIVE
   * keys may — a RETIRING key validates existing artifacts but must not
   * produce new ones.
   */
  canOperate(keyId: string): boolean {
    const key = this._byKeyId.get(keyId);
    return key?.state === KeyState.ACTIVE;
  }

  /** Keys whose grace window has expired but are still in RETIRING state. */
  pastGrace(): ManagedKey[] {
    const now = this._clock();
    const out: ManagedKey[] = [];
    for (const k of this._keys.values()) {
      if (k.state === KeyState.RETIRING && k.validUntil !== undefined && now > k.validUntil) {
        out.push(k);
      }
    }
    return out;
  }

  /** Keys older than `maxAgeMs` (any non-terminal state). */
  olderThan(maxAgeMs: number): ManagedKey[] {
    const now = this._clock();
    const out: ManagedKey[] = [];
    for (const k of this._keys.values()) {
      if (
        (k.state === KeyState.ACTIVE || k.state === KeyState.STAGING) &&
        now - k.generatedAt > maxAgeMs
      ) {
        out.push(k);
      }
    }
    return out;
  }
}
