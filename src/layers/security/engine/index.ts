/**
 * Security Engine — public exports.
 *
 * @module SecurityLayer/Engine
 */

export * from './types';
export { ThreatRulesEngine, DEFAULT_THREAT_RULES } from './ThreatRulesEngine';
export { RequestSigner, canonicalQueryString } from './RequestSigner';
export { IpReputation } from './IpReputation';
export { SecurityHeaders } from './SecurityHeaders';
export {
  SessionManager,
  InMemorySessionStore,
  SessionVerdict,
} from './SessionManager';
export type {
  SessionRecord,
  SessionStore,
  SessionManagerOptions,
  SessionValidation,
  CreateResult,
} from './SessionManager';
export { CsrfProtection, CsrfVerdict } from './CsrfProtection';
export type { CsrfOptions, CsrfTokenPair } from './CsrfProtection';
export { CspBuilder, strictCspBaseline } from './CspBuilder';
export type { CspIssue } from './CspBuilder';
export {
  BreachChecker,
  InMemoryBreachCorpus,
  RemoteCorpusStub,
  sha1Hex,
} from './BreachChecker';
export type {
  BreachCorpus,
  BreachCheckOptions,
  BreachVerdict,
} from './BreachChecker';
