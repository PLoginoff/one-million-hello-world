/**
 * JWT validation sub-module — real JWT parsing, verification, JWK,
 * rotation, refresh and revocation.
 */

export * from './types';
export * from './base64url';
export { JwtParser } from './JwtParser';
export { JwtVerifier, signHs256, looksLikeClaims } from './JwtVerifier';
export type { VerificationKey } from './JwtVerifier';
export { JwkStore } from './JwkStore';
export type { JwkFetchOptions, JwkResolution } from './JwkStore';
export { KeyRotationStrategy } from './KeyRotationStrategy';
export type { SigningKey } from './KeyRotationStrategy';
export { TokenBlacklist } from './TokenBlacklist';
export { JwtIssuer } from './JwtIssuer';
export type { SignOptions } from './JwtIssuer';
export { TokenRefresher } from './TokenRefresher';
export type { TokenRefresherConfig, RefreshTokenRecord } from './TokenRefresher';
