/**
 * Secrets Layer — Core Types
 *
 * Shared contracts for the secret-management engine: providers, versioned
 * values, leases, audit entries and materialization requests.
 *
 * @module Secrets/Vault
 */

/** Injectable clock — epoch ms. */
export type SecretsClock = () => number;

/**
 * One version of a secret's value. Version numbers are 1-based and assigned
 * by the provider (never supplied by callers). `gracePeriodMs` is the
 * rotation window: when a newer version exists, older versions remain
 * readable for that long after being superseded — consumers racing a
 * rotation keep working.
 */
export interface SecretVersion {
  readonly version: number;
  readonly value: string;
  readonly createdAt: number;
  readonly createdBy: string;
  /** Set when superseded: readers may still use it until this epoch ms. */
  readonly expiresAt?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** What a provider returns for a read. */
export interface SecretRead {
  readonly path: string;
  readonly value: string;
  readonly version: number;
  readonly createdAt: number;
  /**
   * When set (superseded versions inside their grace window), the value
   * must not be served past this epoch-ms — caches cap their entry TTL at
   * this bound so grace-window reads never outlive the window.
   */
  readonly expiresAt?: number;
}

/** A dynamic-secret lease (e.g. a generated DB credential). */
export interface SecretLease {
  readonly leaseId: string;
  readonly path: string;
  readonly value: string;
  /** When the lease was issued (epoch ms). */
  readonly issuedAt: number;
  /** Hard expiry — after this the credential is revoked. */
  readonly expiresAt: number;
  /** Renewable leases can be extended up to `maxExpiresAt`. */
  readonly renewable: boolean;
  readonly maxExpiresAt: number;
  /** Opaque provider payload (e.g. a generated username). */
  readonly payload?: Readonly<Record<string, string>>;
}

/**
 * The provider contract — pluggable backends (in-memory, file, remote API).
 * All methods are async: real backends do I/O.
 */
export interface SecretProvider {
  readonly name: string;

  /** Latest version of `path`, or undefined. */
  get(path: string): Promise<SecretRead | undefined>;
  /** Specific version, or undefined. */
  getVersion(path: string, version: number): Promise<SecretRead | undefined>;
  /** Store a new version; returns the version number. */
  put(path: string, value: string, createdBy?: string, metadata?: Record<string, string>): Promise<number>;
  /** Remove every version of `path`. Returns true when something was removed. */
  delete(path: string): Promise<boolean>;
  /**
   * List paths matching `pattern`. `*` = one segment, `**` = any depth,
   * consistent with the configuration layer's wildcard grammar.
   */
  list(pattern: string): Promise<ReadonlyArray<string>>;
  /** All known version numbers for `path`, ascending. */
  versions(path: string): Promise<ReadonlyArray<number>>;
}

/** Errors raised by the secrets engine. */
export class SecretError extends Error {
  readonly code: SecretErrorCode;
  constructor(code: SecretErrorCode, message: string) {
    super(message);
    this.name = 'SecretError';
    this.code = code;
  }
}

export enum SecretErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  VERSION_EXPIRED = 'VERSION_EXPIRED',
  LEASE_EXPIRED = 'LEASE_EXPIRED',
  LEASE_NOT_RENEWABLE = 'LEASE_NOT_RENEWABLE',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  INVALID_PATH = 'INVALID_PATH',
}

/** A request handed to the materializer — `${secret:path}` interpolation. */
export interface MaterializeRequest {
  /** Template containing `${secret:path[@version]}` placeholders. */
  readonly template: string;
}

/** Audit actions recorded by the audit log. */
export type AuditAction =
  | 'read'
  | 'read-version'
  | 'write'
  | 'delete'
  | 'list'
  | 'lease-issue'
  | 'lease-renew'
  | 'lease-revoke'
  | 'cache-hit'
  | 'cache-miss'
  | 'rotate';

export interface AuditEntry {
  readonly seq: number;
  readonly at: number;
  readonly action: AuditAction;
  readonly path: string;
  readonly principal: string;
  /** Free-form detail — never contains secret values. */
  readonly detail?: string;
  readonly success: boolean;
}

/** Principal context attached to reads/writes for the audit log. */
export interface SecretContext {
  readonly principal: string;
}
