/**
 * AccountRecoveryFlow — multi-channel, multi-step account recovery.
 *
 * The core engine has `beginPasswordReset`/`completePasswordReset` —
 * a single-step email token. Real recovery needs a flow engine:
 *
 *   1. INITIATE: identify the account by username/email; create a
 *      recovery session with the available channels.
 *   2. CHALLENGE: issue a proof on a channel (verified email, verified
 *      phone, security backup codes). Multiple channels may be required
 *      per policy (e.g. BOTH email AND phone for high-value accounts).
 *   3. VERIFY: each channel proof consumes a one-time code and records
 *      evidence; the flow is complete when `requiredChannels` are all
 *      satisfied.
 *   4. COMPLETE: emits a one-time `recoveryGrant` the caller exchanges
 *      for a credential reset — the grant is NOT the password reset
 *      token, it's proof the recovery policy was satisfied.
 *
 * Security properties:
 *   - Codes are 6-digit, rate-limited to `maxAttempts` guesses, and
 *     expire — brute force is bounded to 10^6 space per TTL window.
 *   - Attempt throttling per flow: failures lock the flow for
 *     `lockoutMs` after `maxFailures`.
 *   - Channel proofs are channel-bound: a code issued for 'email' never
 *     satisfies 'phone'.
 *   - All transitions are recorded to an audit trail for review.
 *
 * Deliverability is abstracted: the caller supplies `CodeSender`s per
 * channel so the flow is testable in-memory.
 *
 * @module Identity/Engine2
 */

import { createHash, randomInt } from 'crypto';
import type { User } from '../core/types';

// ------------------------------------------------------------------ types

/** Recovery channel kinds. */
export type RecoveryChannel = 'email' | 'phone' | 'backup_code';

/** Sends a recovery code out-of-band. Returns a delivery receipt id. */
export type CodeSender = (destination: string, code: string) => string;

/** Policy controlling how a recovery flow proceeds. */
export interface RecoveryPolicy {
  /** Channels that must ALL be proven before completion. */
  requiredChannels: RecoveryChannel[];
  /** Code TTL (ms). */
  codeTtlMs: number;
  /** Max wrong-code guesses per issued code (default 5). */
  maxAttempts: number;
  /** Consecutive failed verifications before the flow locks (default 3). */
  maxFailures: number;
  /** Lock duration after maxFailures (ms). */
  lockoutMs: number;
  /** Overall flow TTL (ms). */
  flowTtlMs: number;
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  requiredChannels: ['email'],
  codeTtlMs: 10 * 60_000,
  maxAttempts: 5,
  maxFailures: 3,
  lockoutMs: 15 * 60_000,
  flowTtlMs: 60 * 60_000,
};

/** Flow state machine states. */
export enum RecoveryState {
  INITIATED = 'initiated',
  CHALLENGED = 'challenged',
  PARTIALLY_VERIFIED = 'partially_verified',
  VERIFIED = 'verified',
  COMPLETED = 'completed',
  LOCKED = 'locked',
  EXPIRED = 'expired',
}

/** One issued channel challenge. */
export interface ChannelChallenge {
  readonly channel: RecoveryChannel;
  readonly destination: string;
  /** SHA-256 of the issued code (never store raw). */
  readonly codeHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  attempts: number;
  verified: boolean;
}

/** Audit entry for one flow transition. */
export interface RecoveryAuditEntry {
  readonly at: number;
  readonly event: string;
  readonly detail?: string;
}

/** A recovery flow record. */
export interface RecoveryFlow {
  readonly id: string;
  readonly userId: string;
  state: RecoveryState;
  readonly challenges: Map<RecoveryChannel, ChannelChallenge>;
  readonly required: readonly RecoveryChannel[];
  readonly createdAt: number;
  readonly expiresAt: number;
  failures: number;
  lockedUntil?: number;
  /** One-time grant emitted on completion. */
  grant?: string;
  readonly audit: RecoveryAuditEntry[];
}

/** Result of issuing a challenge. */
export interface ChallengeResult {
  channel: RecoveryChannel;
  /** The raw code — returned for the sender; callers must not persist it. */
  code: string;
  receiptId?: string;
  expiresAt: number;
}

// ------------------------------------------------------------------ flow engine

export class AccountRecoveryFlow {
  private readonly _policy: RecoveryPolicy;
  private readonly _flows = new Map<string, RecoveryFlow>();
  private readonly _grants = new Map<string, string>(); // grantHash -> userId
  private readonly _senders: Partial<Record<RecoveryChannel, CodeSender>>;
  private readonly _now: () => number;
  private _seq = 0;

  constructor(
    senders: Partial<Record<RecoveryChannel, CodeSender>>,
    policy: Partial<RecoveryPolicy> = {},
    now: () => number = Date.now,
  ) {
    this._senders = senders;
    this._policy = { ...DEFAULT_RECOVERY_POLICY, ...policy };
    this._now = now;
  }

  private static _hash(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  /**
   * Start a recovery flow for a user. Channels available are derived
   * from the user record (email → 'email', phoneVerified → 'phone',
   * plus 'backup_code' when configured as required).
   */
  initiate(user: User): RecoveryFlow {
    const now = this._now();
    const id = `rcr_${(++this._seq).toString(36)}_${createHash('sha1').update(user.id + now).digest('hex').slice(0, 8)}`;
    const flow: RecoveryFlow = {
      id,
      userId: user.id,
      state: RecoveryState.INITIATED,
      challenges: new Map(),
      required: this._policy.requiredChannels,
      createdAt: now,
      expiresAt: now + this._policy.flowTtlMs,
      failures: 0,
      audit: [{ at: now, event: 'initiated' }],
    };
    this._flows.set(id, flow);
    return flow;
  }

  /** Channels the user can actually be challenged on. */
  availableChannels(user: User): RecoveryChannel[] {
    const out: RecoveryChannel[] = [];
    if (user.email !== undefined && user.emailVerified) out.push('email');
    if (user.phone !== undefined && user.phoneVerified) out.push('phone');
    if (this._policy.requiredChannels.includes('backup_code')) out.push('backup_code');
    return out;
  }

  private _requireFlow(flowId: string): RecoveryFlow {
    const f = this._flows.get(flowId);
    if (!f) throw new Error(`Recovery flow '${flowId}' not found`);
    return f;
  }

  private _checkLive(flow: RecoveryFlow): void {
    const now = this._now();
    if (flow.state === RecoveryState.COMPLETED) throw new Error('Flow already completed');
    if (now > flow.expiresAt) {
      flow.state = RecoveryState.EXPIRED;
      flow.audit.push({ at: now, event: 'expired' });
      throw new Error('Recovery flow expired');
    }
    if (flow.lockedUntil !== undefined && now < flow.lockedUntil) {
      throw new Error(`Flow locked until ${new Date(flow.lockedUntil).toISOString()}`);
    }
  }

  /**
   * Issue a code on a channel. The raw code is returned so the caller
   * delivers it via the registered sender (or its own transport).
   */
  challenge(flowId: string, channel: RecoveryChannel, destination: string): ChallengeResult {
    const flow = this._requireFlow(flowId);
    this._checkLive(flow);
    const now = this._now();

    // CSPRNG 6-digit code.
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ch: ChannelChallenge = {
      channel,
      destination,
      codeHash: AccountRecoveryFlow._hash(`${flow.id}|${channel}|${code}`),
      issuedAt: now,
      expiresAt: now + this._policy.codeTtlMs,
      attempts: 0,
      verified: false,
    };
    flow.challenges.set(channel, ch);
    if (flow.state === RecoveryState.INITIATED || flow.state === RecoveryState.LOCKED) {
      flow.state = RecoveryState.CHALLENGED;
    }
    flow.audit.push({ at: now, event: 'challenge', detail: channel });

    const sender = this._senders[channel];
    const receiptId = sender ? sender(destination, code) : undefined;
    return { channel, code, receiptId, expiresAt: ch.expiresAt };
  }

  /**
   * Submit a code for a channel. On success records the channel as
   * verified; when all required channels are verified the flow
   * transitions to VERIFIED.
   */
  verify(flowId: string, channel: RecoveryChannel, code: string): RecoveryFlow {
    const flow = this._requireFlow(flowId);
    this._checkLive(flow);
    const now = this._now();
    const ch = flow.challenges.get(channel);
    if (!ch) throw new Error(`No challenge issued on channel '${channel}'`);
    if (ch.verified) return flow;
    if (now > ch.expiresAt) {
      flow.audit.push({ at: now, event: 'code_expired', detail: channel });
      throw new Error(`Code on '${channel}' expired`);
    }

    const hash = AccountRecoveryFlow._hash(`${flow.id}|${channel}|${code}`);
    ch.attempts++;
    if (hash !== ch.codeHash) {
      flow.audit.push({ at: now, event: 'bad_code', detail: channel });
      if (ch.attempts >= this._policy.maxAttempts) {
        flow.failures++;
        if (flow.failures >= this._policy.maxFailures) {
          flow.lockedUntil = now + this._policy.lockoutMs;
          flow.state = RecoveryState.LOCKED;
          flow.audit.push({ at: now, event: 'locked' });
        }
        throw new Error(`Too many attempts on '${channel}'`);
      }
      throw new Error('Invalid code');
    }

    ch.verified = true;
    flow.audit.push({ at: now, event: 'verified', detail: channel });
    const allDone = flow.required.every((c) => flow.challenges.get(c)?.verified === true);
    flow.state = allDone ? RecoveryState.VERIFIED : RecoveryState.PARTIALLY_VERIFIED;
    return flow;
  }

  /**
   * Complete a verified flow: mint a one-time grant (the exchangeable
   * proof of recovery) and mark the flow terminal.
   */
  complete(flowId: string): { grant: string; userId: string } {
    const flow = this._requireFlow(flowId);
    this._checkLive(flow);
    if (flow.state !== RecoveryState.VERIFIED) {
      throw new Error(`Flow not verified (state=${flow.state})`);
    }
    const grant = `grant_${createHash('sha256').update(`${flow.id}|${this._now()}|grant`).digest('hex')}`;
    this._grants.set(AccountRecoveryFlow._hash(grant), flow.userId);
    flow.grant = grant;
    flow.state = RecoveryState.COMPLETED;
    flow.audit.push({ at: this._now(), event: 'completed' });
    return { grant, userId: flow.userId };
  }

  /**
   * Exchange a grant — one-time. Returns the user it authorizes.
   * Throws on unknown or already-consumed grants.
   */
  exchangeGrant(grant: string): string {
    const key = AccountRecoveryFlow._hash(grant);
    const userId = this._grants.get(key);
    if (!userId) throw new Error('Invalid or consumed recovery grant');
    this._grants.delete(key);
    return userId;
  }

  /** Inspect a flow (for support tooling). */
  flow(flowId: string): RecoveryFlow | undefined {
    return this._flows.get(flowId);
  }
}
