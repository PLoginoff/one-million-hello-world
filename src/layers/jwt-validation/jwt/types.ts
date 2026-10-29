/**
 * JWT Validation — core types
 *
 * RFC 7519 / RFC 7515 compliant type definitions.
 * No `any` — unknown + type guards throughout.
 */

/* ------------------------------------------------------------------ *
 *  Algorithms                                                         *
 * ------------------------------------------------------------------ */

export type JwtAlgorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'EdDSA'
  | 'none';

export type AlgorithmFamily = 'hmac' | 'rsa' | 'ec' | 'rsa-pss' | 'eddsa' | 'none';

export const ALGORITHM_FAMILY: Readonly<Record<JwtAlgorithm, AlgorithmFamily>> = {
  HS256: 'hmac',
  HS384: 'hmac',
  HS512: 'hmac',
  RS256: 'rsa',
  RS384: 'rsa',
  RS512: 'rsa',
  ES256: 'ec',
  ES384: 'ec',
  ES512: 'ec',
  PS256: 'rsa-pss',
  PS384: 'rsa-pss',
  PS512: 'rsa-pss',
  EdDSA: 'eddsa',
  none: 'none',
};

/** Hash used by each algorithm (informational; verification uses crypto). */
export const ALGORITHM_HASH: Readonly<Record<JwtAlgorithm, string>> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
  RS256: 'sha256',
  RS384: 'sha384',
  RS512: 'sha512',
  ES256: 'sha256',
  ES384: 'sha384',
  ES512: 'sha512',
  PS256: 'sha256',
  PS384: 'sha384',
  PS512: 'sha512',
  EdDSA: 'ed25519',
  none: 'none',
};

/* ------------------------------------------------------------------ *
 *  Header / Claims                                                    *
 * ------------------------------------------------------------------ */

export interface JwtHeader {
  alg: JwtAlgorithm;
  typ?: string;
  cty?: string;
  kid?: string;
  jku?: string;
  jwk?: JsonWebKeyObject;
  x5u?: string;
  x5c?: string[];
  x5t?: string;
  crit?: string[];
}

export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [claim: string]: unknown;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: JwtClaims;
  /** Raw `header.payload` signing input (not base64url). */
  signingInput: string;
  /** Raw signature bytes. */
  signature: Buffer;
  /** Original token string. */
  token: string;
}

/* ------------------------------------------------------------------ *
 *  Validation                                                         *
 * ------------------------------------------------------------------ */

export interface JwtValidationOptions {
  /** Allowed algorithms — REQUIRED. Never trust the token's alg alone. */
  algorithms: JwtAlgorithm[];
  /** Expected issuer(s). */
  issuer?: string | string[];
  /** Expected audience(s). */
  audience?: string | string[];
  /** Expected subject. */
  subject?: string;
  /** Clock skew tolerance in seconds (default 60). */
  clockTolerance?: number;
  /** Maximum token age in seconds. */
  maxAge?: number;
  /** Required claims that must be present. */
  requiredClaims?: string[];
  /** Reject tokens without exp (default false). */
  requireExpiration?: boolean;
  /** Current time override (for tests). Defaults to Date.now(). */
  now?: () => number;
}

export type JwtFailureCode =
  | 'malformed'
  | 'invalid_header'
  | 'invalid_payload'
  | 'algorithm_not_allowed'
  | 'algorithm_confusion'
  | 'signature_invalid'
  | 'signature_verification_failed'
  | 'expired'
  | 'not_yet_valid'
  | 'issued_in_future'
  | 'max_age_exceeded'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'subject_mismatch'
  | 'missing_claim'
  | 'missing_expiration'
  | 'key_not_found'
  | 'revoked'
  | 'kid_mismatch';

export class JwtTokenError extends Error {
  readonly code: JwtFailureCode;
  readonly details?: Record<string, unknown>;

  constructor(code: JwtFailureCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'JwtTokenError';
    this.code = code;
    this.details = details;
  }
}

export interface JwtVerificationResult {
  valid: boolean;
  decoded?: DecodedJwt;
  error?: JwtTokenError;
  /** Key id used for verification, if any. */
  kid?: string;
}

/* ------------------------------------------------------------------ *
 *  JWK                                                                *
 * ------------------------------------------------------------------ */

export interface JsonWebKeyObject {
  kty: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
  x5u?: string;
  x5c?: string[];
  x5t?: string;
  // RSA
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  // EC
  crv?: string;
  x?: string;
  y?: string;
  // OKP
  // crv: 'Ed25519'
  // symmetric
  k?: string;
  [key: string]: unknown;
}

export interface JwkSet {
  keys: JsonWebKeyObject[];
}

/* ------------------------------------------------------------------ *
 *  Type guards                                                        *
 * ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJwtAlgorithm(value: unknown): value is JwtAlgorithm {
  return typeof value === 'string' && value in ALGORITHM_FAMILY;
}

export function isJwtClaims(value: unknown): value is JwtClaims {
  return isRecord(value);
}

export function isJsonWebKey(value: unknown): value is JsonWebKeyObject {
  return isRecord(value) && typeof value['kty'] === 'string';
}

export function isJwkSet(value: unknown): value is JwkSet {
  return isRecord(value) && Array.isArray(value['keys']) && (value['keys'] as unknown[]).every(isJsonWebKey);
}

/* ------------------------------------------------------------------ *
 *  Refresh / rotation types                                           *
 * ------------------------------------------------------------------ */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  tokenType: 'Bearer';
}

export interface RefreshResult {
  rotated: boolean;
  pair?: TokenPair;
  error?: JwtTokenError;
}

export interface KeyRotationConfig {
  /** Max age of a key before it is rotated out (ms). */
  maxKeyAgeMs: number;
  /** How long retired keys remain valid for verification (ms). */
  retirementGraceMs: number;
  /** Maximum number of retired keys kept for verification. */
  maxRetiredKeys: number;
}
