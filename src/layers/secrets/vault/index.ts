/**
 * Secrets Vault — public exports.
 */

export * from './SecretTypes';
export { EncryptedStore } from './EncryptedStore';
export type { EncryptedEnvelope } from './EncryptedStore';
export { VersionedSecretProvider } from './VersionedProvider';
export type { VersionedProviderOptions } from './VersionedProvider';
export { CachedSecretProvider } from './SecretCache';
export type { SecretCacheOptions, SecretCacheStats } from './SecretCache';
export { LeaseManager } from './LeaseManager';
export type { LeaseOptions, LeaseFactory } from './LeaseManager';
export { SecretAuditLog } from './SecretAuditLog';
export type { AuditQuery } from './SecretAuditLog';
export { SecretsEngine } from './SecretsEngine';
export type { SecretsEngineOptions } from './SecretsEngine';
export { SecretPolicyEngine, ALL_CAPABILITIES } from './SecretPolicy';
export type { SecretCapability, PolicyRule, PolicyDocument, PolicyDecision } from './SecretPolicy';
export { SecretRotator } from './SecretRotator';
export type { RotationEntry, RotationError, RotationRegistration } from './SecretRotator';
