/**
 * ValidatingClient — composes JWKS resolution, cnf binding, scope
 * authorization, and introspection into one token-validation pipeline.
 *
 * Pipeline for each presented token (already signature-verified by the
 * caller or resolved via JWKS here):
 *   1. `resolveKey(header)` → JWK from the JWKS cache (kid-triggered
 *      refresh on miss).
 *   2. `authorize(claims, permission)` → scope check.
 *   3. `checkBinding(claims, proof)` → cnf verification.
 *   4. `introspect(token)` → remote check for opaque/revocable tokens.
 *
 * The composition is deliberate: local checks (cheap) run first, remote
 * introspection only when the caller asks for it.
 *
 * @module JwtValidationLayer/Engine2
 */

import { JwksCache, KeyResolution } from './JwksCache';
import { TokenBinding, PresentedProof, BindingOutcome } from './TokenBinding';
import { ScopeAuthorizer, AuthzDecision } from './ScopeAuthorizer';
import { IntrospectionClient, IntrospectionResult2 } from './IntrospectionClient';
import { TokenClaims2, TokenHeader2 } from './types';

export class ValidatingClient {
  readonly jwks: JwksCache;
  readonly binding: TokenBinding;
  readonly authz: ScopeAuthorizer;
  readonly introspector: IntrospectionClient | null;

  constructor(opts: {
    jwks: JwksCache;
    authorizer: ScopeAuthorizer;
    binding?: TokenBinding;
    introspector?: IntrospectionClient;
  }) {
    this.jwks = opts.jwks;
    this.authz = opts.authorizer;
    this.binding = opts.binding ?? new TokenBinding();
    this.introspector = opts.introspector ?? null;
  }

  /** Resolve the signing key for a token header (kid-triggered refresh). */
  async resolveKey(header: TokenHeader2): Promise<KeyResolution | null> {
    return this.jwks.resolve(header.kid, header.alg);
  }

  /**
   * Full local check: binding + scope. Returns the first failure.
   * Introspection is deliberately NOT called — see `fullCheck`.
   */
  localCheck(
    claims: TokenClaims2,
    proof: PresentedProof,
    permission: string
  ): { ok: true } | { ok: false; stage: 'binding' | 'scope'; detail: BindingOutcome | AuthzDecision } {
    const bound = this.binding.verify(claims, proof);
    if (bound.kind === 'mismatch' || bound.kind === 'unverifiable') {
      return { ok: false, stage: 'binding', detail: bound };
    }
    const auth = this.authz.authorize(claims, permission);
    if (!auth.allowed) {
      return { ok: false, stage: 'scope', detail: auth };
    }
    return { ok: true };
  }

  /**
   * Local check + remote introspection for opaque tokens. Introspection
   * is skipped when the local check already failed (fail fast, save the
   * network call).
   */
  async fullCheck(
    token: string,
    claims: TokenClaims2,
    proof: PresentedProof,
    permission: string
  ): Promise<
    | { ok: true; introspection: IntrospectionResult2 | null }
    | { ok: false; stage: 'binding' | 'scope' | 'introspection'; detail: unknown }
  > {
    const local = this.localCheck(claims, proof, permission);
    if (!local.ok) return local as { ok: false; stage: 'binding' | 'scope'; detail: unknown };
    if (!this.introspector) {
      return { ok: true, introspection: null };
    }
    const intro = await this.introspector.introspect(token);
    if (!intro.active) {
      return { ok: false, stage: 'introspection', detail: intro };
    }
    return { ok: true, introspection: intro };
  }
}
