/**
 * Identity Core Types
 *
 * Shared type definitions for the real identity-management engine:
 * user entities, credentials, lifecycle states, verification tokens,
 * sessions, password policy, and identity-merge results.
 *
 * @module Identity/Core
 */

/** Account lifecycle state. */
export enum AccountStatus {
  /** Account can authenticate and use the system. */
  ACTIVE = 'active',
  /** Temporarily locked (e.g. failed-login threshold); cannot authenticate. */
  LOCKED = 'locked',
  /** Administratively suspended; cannot authenticate until reinstated. */
  SUSPENDED = 'suspended',
  /** Soft-deleted; tombstoned but retained for audit/recovery. */
  DELETED = 'deleted',
}

/** Purpose of a single-use verification token. */
export enum TokenPurpose {
  EMAIL_VERIFICATION = 'email_verification',
  PHONE_VERIFICATION = 'phone_verification',
  PASSWORD_RESET = 'password_reset',
  ACCOUNT_RECOVERY = 'account_recovery',
}

/** A salted password credential produced by the scrypt hasher. */
export interface PasswordCredential {
  /** Hash algorithm descriptor, e.g. "scrypt:N=16384,r=8,p=1". */
  algorithm: string;
  /** Derived key, hex-encoded. */
  hash: string;
  /** Per-password random salt, hex-encoded. */
  salt: string;
  /** Epoch ms when this credential was set. */
  createdAt: number;
}

/** One-time verification token bound to a user + purpose. */
export interface VerificationToken {
  /** Opaque token value presented by the user. */
  token: string;
  /** Owning user id. */
  userId: string;
  /** What the token authorizes. */
  purpose: TokenPurpose;
  /** Destination the token was issued for (email/phone); empty if n/a. */
  destination: string;
  /** Epoch ms after which the token is invalid. */
  expiresAt: number;
  /** True once consumed — tokens are single-use. */
  consumed: boolean;
}

/** An authenticated session bound to a user. */
export interface Session {
  /** Opaque session id. */
  id: string;
  /** Owning user id. */
  userId: string;
  /** Epoch ms created. */
  createdAt: number;
  /** Epoch ms of last activity. */
  lastSeenAt: number;
  /** Optional absolute expiry; undefined = no expiry. */
  expiresAt?: number;
  /** Arbitrary session metadata (device, IP, etc.). */
  metadata: Record<string, unknown>;
}

/** Profile attributes for a user account. */
export interface UserProfile {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
  timezone?: string;
  /** Additional free-form attributes. */
  attributes: Record<string, unknown>;
}

/** The stored user entity. */
export interface User {
  id: string;
  /** Unique, case-insensitive username. */
  username: string;
  /** Lower-cased email, or undefined if none. */
  email?: string;
  /** E.164-ish phone, or undefined if none. */
  phone?: string;
  status: AccountStatus;
  credential?: PasswordCredential;
  profile: UserProfile;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Epoch ms created / last modified. */
  createdAt: number;
  updatedAt: number;
  /** Consecutive failed authentication attempts since last success. */
  failedLoginAttempts: number;
  /** If locked due to failures, epoch ms when the lock clears; else undefined. */
  lockedUntil?: number;
  /** If this user was merged away, the surviving user id. */
  mergedInto?: string;
}

/** Public (safe) view of a user — no credential material. */
export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  status: AccountStatus;
  profile: UserProfile;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Input for registering a new identity. */
export interface RegisterInput {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  profile?: Partial<UserProfile>;
}

/** Outcome categories for an authentication attempt. */
export enum AuthResultCode {
  SUCCESS = 'success',
  UNKNOWN_USER = 'unknown_user',
  BAD_CREDENTIALS = 'bad_credentials',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
  PASSWORD_EXPIRED = 'password_expired',
}

/** Result of a password authentication attempt. */
export interface AuthResult {
  code: AuthResultCode;
  /** Session on success. */
  session?: Session;
  /** Public user on success. */
  user?: PublicUser;
}

/** A single failed password-policy rule. */
export interface PolicyViolation {
  /** Machine-readable rule id, e.g. "min_length". */
  rule: string;
  /** Human-readable explanation. */
  message: string;
}

/** Result of evaluating a password against the policy engine. */
export interface PasswordCheckResult {
  ok: boolean;
  violations: PolicyViolation[];
  /** 0-4 rough strength score (zxcvbn-style buckets). */
  score: number;
}

/** Password policy configuration. */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  /** Number of previous passwords a new password must differ from. */
  historySize: number;
  /** Substrings that must not appear (username, email local part, etc.). */
  forbidUserInfo: boolean;
  /** Enable breach-list check. */
  breachCheck: boolean;
}

/** Default, reasonably-strict policy. */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: false,
  historySize: 5,
  forbidUserInfo: true,
  breachCheck: true,
};

/** How a candidate matched in identity-merge search. */
export enum MergeMatchKind {
  SAME_EMAIL = 'same_email',
  SAME_PHONE = 'same_phone',
  SAME_USERNAME = 'same_username',
}

/** A candidate account for merging into `primaryId`. */
export interface MergeCandidate {
  userId: string;
  match: MergeMatchKind;
  /** 0..1 confidence. */
  confidence: number;
}

/** Result of merging `secondaryId` into `primaryId`. */
export interface MergeResult {
  primaryId: string;
  secondaryId: string;
  /** Fields copied onto the primary (that it lacked). */
  adoptedFields: string[];
  /** Sessions re-pointed to the primary. */
  sessionsReassigned: number;
}

/** Identity-engine configuration. */
export interface IdentityEngineConfig {
  passwordPolicy: PasswordPolicy;
  /** Scrypt parameters. */
  scrypt: { N: number; r: number; p: number; keyLen: number };
  /** Failed attempts before lockout. */
  lockoutThreshold: number;
  /** Lockout duration ms. */
  lockoutDurationMs: number;
  /** Default verification-token TTL ms. */
  tokenTtlMs: number;
  /** Max concurrent sessions per user; oldest evicted beyond this. 0 = unlimited. */
  maxSessionsPerUser: number;
}

export const DEFAULT_IDENTITY_ENGINE_CONFIG: IdentityEngineConfig = {
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
  scrypt: { N: 16384, r: 8, p: 1, keyLen: 64 },
  lockoutThreshold: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  tokenTtlMs: 24 * 60 * 60 * 1000,
  maxSessionsPerUser: 10,
};

/** Error codes raised by the identity engine. */
export enum IdentityErrorCode {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USERNAME_TAKEN = 'USERNAME_TAKEN',
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_CONSUMED = 'TOKEN_CONSUMED',
  TOKEN_PURPOSE_MISMATCH = 'TOKEN_PURPOSE_MISMATCH',
  ILLEGAL_TRANSITION = 'ILLEGAL_TRANSITION',
  MERGE_SELF = 'MERGE_SELF',
  MERGE_TARGET_DELETED = 'MERGE_TARGET_DELETED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
}

/** Engine error type. */
export class IdentityCoreError extends Error {
  readonly code: IdentityErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: IdentityErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'IdentityCoreError';
    this.code = code;
    this.details = details;
  }
}

/** Strip credential material for a public view. */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    phone: u.phone,
    status: u.status,
    profile: u.profile,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
