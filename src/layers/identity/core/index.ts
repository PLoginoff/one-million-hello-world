/**
 * Identity Core — real identity-management engine.
 */

export {
  AccountStatus,
  TokenPurpose,
  AuthResultCode,
  MergeMatchKind,
  IdentityErrorCode,
  IdentityCoreError,
  DEFAULT_PASSWORD_POLICY,
  DEFAULT_IDENTITY_ENGINE_CONFIG,
  toPublicUser,
} from './types';
export type {
  PasswordCredential,
  VerificationToken,
  Session,
  UserProfile,
  User,
  PublicUser,
  RegisterInput,
  AuthResult,
  PolicyViolation,
  PasswordCheckResult,
  PasswordPolicy,
  MergeCandidate,
  MergeResult,
  IdentityEngineConfig,
} from './types';

export { PasswordHasher } from './PasswordHasher';
export type { ScryptParams } from './PasswordHasher';

export { PasswordPolicyEngine, DEFAULT_BREACH_LIST } from './PasswordPolicyEngine';
export type { BreachProbe } from './PasswordPolicyEngine';

export { AccountLifecycle } from './AccountLifecycle';
export { VerificationTokenStore } from './VerificationTokenStore';
export { SessionRegistry } from './SessionRegistry';
export { IdentityStore, normalizeEmail, normalizePhone } from './IdentityStore';
export { IdentityEngine } from './IdentityEngine';
export { TotpEngine, base32Encode, base32Decode } from './TotpEngine';
export type { TotpOptions } from './TotpEngine';
export { IdentityAuditLog, AuditEventKind } from './IdentityAuditLog';
export type { AuditEntry, AuditQuery } from './IdentityAuditLog';
export { GroupGraph } from './GroupGraph';
export type { Group } from './GroupGraph';
export { CredentialVault } from './CredentialVault';
export type { VaultKey } from './CredentialVault';
