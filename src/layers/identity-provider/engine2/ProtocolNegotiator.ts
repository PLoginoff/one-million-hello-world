/**
 * ProtocolNegotiator — SAML vs OIDC selection per relying party.
 *
 * A real IdP fronts partners speaking different protocols. When a
 * login request arrives (or an admin registers a partner), the
 * negotiator picks the protocol to use, given:
 *
 *   - what the PARTNER supports (from its registered capabilities or
 *     metadata — OIDC `grant_types`, SAML bindings)
 *   - what the request itself signals (OIDC `response_type=code`
 *     params vs a SAML `AuthnRequest` envelope)
 *   - the IdP's own protocol preference order
 *
 * Selection algorithm:
 *   1. DETECT the request's native protocol from its shape.
 *   2. If the partner supports it → negotiate to that protocol.
 *   3. Otherwise fall back to the highest-priority protocol in the
 *      INTERSECTION of (partner capabilities × IdP preference order).
 *   4. No intersection → negotiation failure with a diagnostic.
 *
 * Also handles binding selection within SAML (Redirect vs POST) and
 * grant-type filtering within OIDC — the second-level negotiation real
 * IdPs perform after the coarse protocol pick.
 *
 * @module IdentityProvider/Engine2
 */

// ------------------------------------------------------------------ types

/** Protocols the negotiator can pick. */
export enum FederationProtocol {
  OIDC = 'oidc',
  SAML2 = 'saml2',
}

/** What a partner entity can speak. */
export interface PartnerCapabilities {
  readonly entityId: string;
  /** Supported protocols; empty = unknown (treated as all). */
  readonly protocols: FederationProtocol[];
  /** OIDC grant types (e.g. 'authorization_code', 'refresh_token'). */
  readonly oidcGrants: string[];
  /** SAML bindings (e.g. 'HTTP-Redirect', 'HTTP-POST'). */
  readonly samlBindings: string[];
}

/** Shape-signals extracted from an inbound authn request. */
export interface RequestSignals {
  /** OIDC-style authorization params present. */
  readonly hasOidcParams: boolean;
  /** SAML AuthnRequest envelope present. */
  readonly hasSamlRequest: boolean;
  /** Requested OIDC scope list. */
  readonly scopes: string[];
  /** OIDC response_type if present. */
  readonly responseType?: string;
  /** SAML requested binding if present. */
  readonly samlBinding?: string;
}

/** Negotiation outcome. */
export interface NegotiationResult {
  readonly ok: boolean;
  readonly protocol?: FederationProtocol;
  /** Chosen OIDC grant or SAML binding. */
  readonly binding?: string;
  /** Why negotiation failed, when it did. */
  readonly reason?: string;
  /** Protocols considered, in preference order applied. */
  readonly considered: FederationProtocol[];
}

// ------------------------------------------------------------------ detection

/**
 * Detect the protocol a request natively speaks. OIDC wins when both
 * signal sets are present (a proxied request may carry both) since
 * OIDC params are the more specific signal.
 */
export function detectProtocol(req: RequestSignals): FederationProtocol | undefined {
  if (req.hasOidcParams && req.responseType !== undefined) return FederationProtocol.OIDC;
  if (req.hasSamlRequest) return FederationProtocol.SAML2;
  if (req.hasOidcParams) return FederationProtocol.OIDC;
  return undefined;
}

// ------------------------------------------------------------------ negotiator

export class ProtocolNegotiator {
  /** IdP protocol preference order — first supported wins on fallback. */
  private readonly _preference: FederationProtocol[];
  private readonly _partners = new Map<string, PartnerCapabilities>();

  constructor(preference: FederationProtocol[] = [FederationProtocol.OIDC, FederationProtocol.SAML2]) {
    this._preference = preference;
  }

  /** Register or replace a partner's capabilities. */
  registerPartner(caps: PartnerCapabilities): void {
    this._partners.set(caps.entityId, caps);
  }

  unregisterPartner(entityId: string): boolean {
    return this._partners.delete(entityId);
  }

  capabilities(entityId: string): PartnerCapabilities | undefined {
    return this._partners.get(entityId);
  }

  /**
   * Negotiate the protocol for `entityId` given an inbound request's
   * signals. Unregistered partners are treated as capability-agnostic
   * (they speak whatever the request speaks, or the IdP preference).
   */
  negotiate(entityId: string, req: RequestSignals): NegotiationResult {
    const caps = this._partners.get(entityId);
    const supported = caps && caps.protocols.length > 0 ? caps.protocols : [...this._preference];
    const detected = detectProtocol(req);
    const considered: FederationProtocol[] = [];

    // Pass 1: native protocol if the partner speaks it.
    if (detected !== undefined && supported.includes(detected)) {
      considered.push(detected);
      const binding = this._bindingFor(detected, caps, req);
      return { ok: true, protocol: detected, binding, considered };
    }
    if (detected !== undefined) considered.push(detected);

    // Pass 2: IdP preference order intersect partner capabilities.
    for (const proto of this._preference) {
      if (considered.includes(proto)) continue;
      considered.push(proto);
      if (supported.includes(proto)) {
        const binding = this._bindingFor(proto, caps, req);
        return { ok: true, protocol: proto, binding, considered };
      }
    }

    return {
      ok: false,
      considered,
      reason:
        detected !== undefined
          ? `partner does not support detected protocol ${detected}; no common fallback`
          : 'could not detect request protocol and no common protocol exists',
    };
  }

  /** Pick the second-level binding: OIDC grant or SAML binding. */
  private _bindingFor(proto: FederationProtocol, caps: PartnerCapabilities | undefined, req: RequestSignals): string | undefined {
    if (proto === FederationProtocol.OIDC) {
      const grants = caps?.oidcGrants ?? ['authorization_code'];
      // Map response_type to a grant; default to authorization_code.
      const wants = req.responseType === 'code' ? 'authorization_code' : grants[0];
      return grants.includes(wants ?? '') ? wants : grants[0];
    }
    const bindings = caps?.samlBindings ?? ['HTTP-Redirect', 'HTTP-POST'];
    if (req.samlBinding && bindings.includes(req.samlBinding)) return req.samlBinding;
    return bindings[0];
  }
}
