/**
 * MFA Engine 2 — public surface.
 *
 * WebAuthn-style challenge-response ceremonies, risk-based adaptive MFA,
 * declarative MFA policies, and trusted-device remember-me tokens.
 *
 * @module Mfa/Engine2
 */

export {
  assertionPayload,
  concat,
  hex,
  SeededRandomSource,
  sha256,
  SoftAuthenticator,
  StubSigner,
  SystemRandomSource,
  timingSafeEqual,
  utf8,
  WebAuthnCeremony,
  WebAuthnError,
} from './WebAuthn';
export type {
  AssertionChallenge,
  AssertionResponse,
  AssertionResult,
  AttestationResponse,
  Bytes,
  IRandomSource,
  ISigner,
  RegistrationChallenge,
  StoredCredential,
} from './WebAuthn';

export { DEFAULT_WEIGHTS, RiskScorer, StepUpDecider } from './RiskBasedMfa';
export type {
  RiskAssessment,
  RiskContext,
  RiskDecision,
  RiskPolicy,
  RiskWeights,
  SignalContribution,
} from './RiskBasedMfa';

export { globMatch, MfaPolicyEngine } from './MfaPolicy';
export type {
  AssertedFactor,
  FactorSet,
  PolicyDecision,
  PolicyRequest,
  PolicyRule,
} from './MfaPolicy';

export { TrustedDeviceStore } from './TrustedDevice';
export type { DeviceToken, TrustedDevice, TrustedDeviceOptions } from './TrustedDevice';

export { MfaOrchestrator } from './MfaOrchestrator';
export type { AuthAttempt, MfaPlan } from './MfaOrchestrator';
