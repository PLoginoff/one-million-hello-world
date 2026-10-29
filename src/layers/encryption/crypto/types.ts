/**
 * Encryption crypto types.
 */

/* ------------------------------------------------------------------ *
 *  Envelope                                                           *
 * ------------------------------------------------------------------ */

export interface EncryptedEnvelope {
  /** Version marker — allows future format evolution. */
  v: 1;
  /** Cipher algorithm identifier. */
  alg: 'A256GCM';
  /** Base64-encoded 12-byte IV/nonce. */
  iv: string;
  /** Base64-encoded ciphertext + GCM tag appended (16 bytes). */
  ct: string;
  /** Optional AAD hash that was bound into the tag (not stored in clear). */
  aadHash?: string;
  /** Key id that produced this ciphertext (for rotation). */
  kid?: string;
}

export interface EnvelopeKey {
  kid: string;
  /** 32-byte Data Encryption Key. */
  key: Buffer;
  createdAtMs: number;
  status: 'active' | 'retired';
}

/* ------------------------------------------------------------------ *
 *  KDF                                                                *
 * ------------------------------------------------------------------ */

export type KdfAlgorithm = 'pbkdf2-sha256' | 'pbkdf2-sha512' | 'scrypt' | 'argon2id-stub' | 'hkdf-sha256';

export interface KdfParams {
  algorithm: KdfAlgorithm;
  /** PBKDF2 iterations */
  iterations?: number;
  /** scrypt N/r/p */
  scryptN?: number;
  scryptR?: number;
  scryptP?: number;
  /** argon2 memory KiB / iterations / parallelism (stub) */
  argon2MemoryKiB?: number;
  argon2Iterations?: number;
  argon2Parallelism?: number;
  /** Derived key length in bytes (default 32). */
  lengthBytes?: number;
  /** HKDF info/context */
  hkdfInfo?: string;
}

/* ------------------------------------------------------------------ *
 *  Errors                                                             *
 * ------------------------------------------------------------------ */

export type CryptoErrorCode =
  | 'encrypt_failed'
  | 'decrypt_failed'
  | 'tag_mismatch'
  | 'key_not_found'
  | 'key_retired'
  | 'invalid_format'
  | 'kdf_unsupported'
  | 'weak_params';

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;
  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 *  Type guards                                                        *
 * ------------------------------------------------------------------ */

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as EncryptedEnvelope).v === 1 &&
    typeof (v as EncryptedEnvelope).iv === 'string' &&
    typeof (v as EncryptedEnvelope).ct === 'string' &&
    (v as EncryptedEnvelope).alg === 'A256GCM'
  );
}
