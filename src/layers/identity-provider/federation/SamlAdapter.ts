/**
 * SamlAdapter — SAML-ish protocol adapter.
 *
 * Implements the IdP-side message lifecycle:
 *
 *   buildAuthnRequest()     — SP-side helper producing a well-formed
 *                             AuthnRequest (used in tests/federation)
 *   parseAuthnRequest()     — structural validation of a received request
 *   buildResponse()         — issue a signed Response containing a signed
 *                             Assertion with conditions, subject/NameID,
 *                             and filtered attributes
 *   parseResponse()         — verify signature, conditions (time window,
 *                             audience), and inResponseTo correlation
 *   buildLogoutRequest()    — create a SLO request bound to a NameID and
 *                             optional session index
 *   parseLogoutMessage()    — validate an inbound logout request/response
 *
 * Assertions are signed with the IdP's current signing key through
 * KeyResolver (HMAC-stubbed), and verified back against the asserting
 * entity's published keys.
 *
 * @module IdentityProvider/Federation
 */

import { randomBytes } from 'crypto';
import { KeyResolver, canonicalize } from './KeyResolver';
import {
  SamlAuthnRequest,
  SamlAssertion,
  SamlResponse,
  SamlLogoutMessage,
  NameIdFormat,
  FederationError,
  FederationErrorCode,
} from './types';

let _counter = 0;
function nextId(prefix: string): string {
  return `_${prefix}_${Date.now().toString(36)}_${(_counter++).toString(36)}_${randomBytes(6).toString('base64url')}`;
}

/** Payload actually signed inside an assertion. */
interface AssertionSignedContent {
  id: string;
  issuer: string;
  subject: { nameId: string; nameIdFormat: NameIdFormat };
  conditions: { notBefore: number; notOnOrAfter: number; audience: string };
  attributes: Record<string, string[]>;
  authnContextClassRef: string;
  sessionIndex?: string;
}

export class SamlAdapter {
  private readonly _keys: KeyResolver;
  private readonly _clockSkewMs: number;

  constructor(keys: KeyResolver, clockSkewMs = 60_000) {
    this._keys = keys;
    this._clockSkewMs = clockSkewMs;
  }

  // ------------------------------------------------------------------
  // AuthnRequest
  // ------------------------------------------------------------------

  /** SP-side helper: construct a well-formed AuthnRequest. */
  buildAuthnRequest(input: {
    issuer: string;
    acsUrl: string;
    nameIdFormat?: NameIdFormat;
    relayState?: string;
    now?: number;
  }): SamlAuthnRequest {
    return {
      id: nextId('authnreq'),
      issuer: input.issuer,
      issueInstant: input.now ?? Date.now(),
      assertionConsumerServiceUrl: input.acsUrl,
      nameIdPolicyFormat: input.nameIdFormat,
      relayState: input.relayState,
    };
  }

  /** Validate an inbound AuthnRequest's structure. */
  parseAuthnRequest(raw: Record<string, unknown>): SamlAuthnRequest {
    const str = (k: string): string => {
      const v = raw[k];
      if (typeof v !== 'string' || v.length === 0) {
        throw new FederationError(FederationErrorCode.BAD_REQUEST, `AuthnRequest missing ${k}`);
      }
      return v;
    };
    const issueInstant = raw.issueInstant;
    if (typeof issueInstant !== 'number') {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'AuthnRequest missing issueInstant');
    }
    return {
      id: str('id'),
      issuer: str('issuer'),
      issueInstant,
      assertionConsumerServiceUrl: str('assertionConsumerServiceUrl'),
      nameIdPolicyFormat:
        typeof raw.nameIdPolicyFormat === 'string'
          ? (raw.nameIdPolicyFormat as NameIdFormat)
          : undefined,
      relayState: typeof raw.relayState === 'string' ? raw.relayState : undefined,
    };
  }

  // ------------------------------------------------------------------
  // Response / Assertion
  // ------------------------------------------------------------------

  /**
   * Build a signed Response to an AuthnRequest.
   *
   * `assertionInput` carries the already-negotiated NameID and the
   * release-filtered attributes.
   */
  buildResponse(input: {
    issuer: string;
    inResponseTo: string;
    destination: string;
    audience: string;
    subject: { nameId: string; nameIdFormat: NameIdFormat };
    attributes: Record<string, string[]>;
    ttlMs: number;
    sessionIndex?: string;
    authnContextClassRef?: string;
    relayState?: string;
    alg?: string;
    now?: number;
  }): SamlResponse {
    const now = input.now ?? Date.now();
    const content: AssertionSignedContent = {
      id: nextId('assert'),
      issuer: input.issuer,
      subject: input.subject,
      conditions: {
        notBefore: now - this._clockSkewMs,
        notOnOrAfter: now + input.ttlMs,
        audience: input.audience,
      },
      attributes: input.attributes,
      authnContextClassRef: input.authnContextClassRef ?? 'urn:oasis:names:tc:SAML:2.0:ac:classes:Password',
      ...(input.sessionIndex !== undefined ? { sessionIndex: input.sessionIndex } : {}),
    };
    const signature = this._keys.sign(input.issuer, input.alg ?? 'RS256-stub', content, now);
    const assertion: SamlAssertion = { ...content, signature };
    return {
      id: nextId('resp'),
      inResponseTo: input.inResponseTo,
      issuer: input.issuer,
      destination: input.destination,
      issueInstant: now,
      status: 'Success',
      assertion,
      relayState: input.relayState,
    };
  }

  /**
   * Verify an inbound Response: signature via issuer's published keys,
   * conditions window (with skew), audience, and status.
   *
   * `expectedInResponseTo` correlates against the outstanding request
   * id the SP tracked; pass undefined for unsolicited (IdP-initiated).
   */
  parseResponse(
    response: SamlResponse,
    expectedInResponseTo?: string,
    expectedAudience?: string,
    now: number = Date.now()
  ): SamlAssertion {
    if (response.status !== 'Success') {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, `SAML response status: ${response.status}`);
    }
    if (expectedInResponseTo !== undefined && response.inResponseTo !== expectedInResponseTo) {
      throw new FederationError(FederationErrorCode.STATE_MISMATCH, 'inResponseTo mismatch');
    }
    const assertion = response.assertion;
    if (!assertion) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'response carries no assertion');
    }
    const { signature, ...content } = assertion;
    if (!this._keys.verify(response.issuer, signature.kid, content, signature.value, now)) {
      throw new FederationError(FederationErrorCode.INVALID_SIGNATURE, 'assertion signature invalid');
    }
    const c = assertion.conditions;
    if (now < c.notBefore - this._clockSkewMs || now >= c.notOnOrAfter + this._clockSkewMs) {
      throw new FederationError(FederationErrorCode.ASSERTION_EXPIRED, 'assertion outside validity window');
    }
    if (expectedAudience !== undefined && c.audience !== expectedAudience) {
      throw new FederationError(FederationErrorCode.AUDIENCE_MISMATCH, 'assertion audience mismatch');
    }
    return assertion;
  }

  // ------------------------------------------------------------------
  // Single Logout
  // ------------------------------------------------------------------

  /** Build a SLO request (or response when `inResponseTo` is set). */
  buildLogoutMessage(input: {
    issuer: string;
    destination: string;
    nameId?: string;
    sessionIndex?: string;
    inResponseTo?: string;
    status?: SamlLogoutMessage['status'];
    now?: number;
  }): SamlLogoutMessage {
    return {
      id: nextId('slo'),
      issuer: input.issuer,
      issueInstant: input.now ?? Date.now(),
      nameId: input.nameId,
      sessionIndex: input.sessionIndex,
      destination: input.destination,
      inResponseTo: input.inResponseTo,
      status: input.status,
    };
  }

  /** Validate an inbound SLO message. */
  parseLogoutMessage(raw: Record<string, unknown>): SamlLogoutMessage {
    const str = (k: string): string => {
      const v = raw[k];
      if (typeof v !== 'string' || v.length === 0) {
        throw new FederationError(FederationErrorCode.BAD_REQUEST, `LogoutMessage missing ${k}`);
      }
      return v;
    };
    const issueInstant = raw.issueInstant;
    if (typeof issueInstant !== 'number') {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'LogoutMessage missing issueInstant');
    }
    return {
      id: str('id'),
      issuer: str('issuer'),
      issueInstant,
      nameId: typeof raw.nameId === 'string' ? raw.nameId : undefined,
      sessionIndex: typeof raw.sessionIndex === 'string' ? raw.sessionIndex : undefined,
      destination: str('destination'),
      inResponseTo: typeof raw.inResponseTo === 'string' ? raw.inResponseTo : undefined,
      status: typeof raw.status === 'string' ? (raw.status as SamlLogoutMessage['status']) : undefined,
    };
  }

  /**
   * Canonical XML-ish serialization of a Response for transport
   * (deterministic string form; not real XML).
   */
  serializeResponse(response: SamlResponse): string {
    return `SAMLResponse(${canonicalize(response)})`;
  }
}
