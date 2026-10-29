/**
 * SamlResponseParser — minimal SAML 2.0 Response parsing stub.
 *
 * Parses base64-encoded XML, extracts the assertion's NameID, attributes,
 * conditions and session index. Signature verification is stubbed to a
 * boolean flag on the document (real verification requires XML-DSig which
 * is out of scope for a stub).
 */

import { createHash } from 'crypto';
import { SamlResponse, SsoFederationError as SamlError } from './types';

export class SamlResponseParser {
  /**
   * Parse a base64-encoded SAML response.
   */
  static parse(encoded: string, opts: { now?: () => number; expectedAudience?: string } = {}): SamlResponse {
    const xml = Buffer.from(encoded, 'base64').toString('utf8');
    return this.parseXml(xml, opts);
  }

  /**
   * Parse raw XML (test helper).
   */
  static parseXml(xml: string, opts: { now?: () => number; expectedAudience?: string } = {}): SamlResponse {
    const now = opts.now ?? (() => Date.now());
    const response = this.extractAssertion(xml);
    this.validateConditions(response, now(), opts.expectedAudience);
    return response;
  }

  /**
   * Build a SAML response (test helper — NOT for production signing).
   */
  static buildResponse(opts: {
    issuer: string;
    nameId: string;
    attributes?: Record<string, string[]>;
    notBeforeMs?: number;
    notOnOrAfterMs?: number;
    audience?: string;
    sessionIndex?: string;
    signed?: boolean;
  }): string {
    const attrs = Object.entries(opts.attributes ?? {})
      .map(
        ([name, values]) =>
          `<saml:Attribute Name="${this.esc(name)}">${values
            .map((v) => `<saml:AttributeValue>${this.esc(v)}</saml:AttributeValue>`)
            .join('')}</saml:Attribute>`
      )
      .join('');
    const conditions =
      opts.notBeforeMs !== undefined || opts.notOnOrAfterMs !== undefined || opts.audience
        ? `<saml:Conditions${
            opts.notBeforeMs ? ` NotBefore="${new Date(opts.notBeforeMs).toISOString()}"` : ''
          }${
            opts.notOnOrAfterMs
              ? ` NotOnOrAfter="${new Date(opts.notOnOrAfterMs).toISOString()}"`
              : ''
          }>${
            opts.audience
              ? `<saml:AudienceRestriction><saml:Audience>${this.esc(
                  opts.audience
                )}</saml:Audience></saml:AudienceRestriction>`
              : ''
          }</saml:Conditions>`
        : '';
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${createHash('sha1')
      .update(Math.random().toString())
      .digest('hex')
      .slice(0, 16)}">
  <saml:Issuer>${this.esc(opts.issuer)}</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_assert">
    <saml:Subject>
      <saml:NameID>${this.esc(opts.nameId)}</saml:NameID>
    </saml:Subject>
    ${conditions}
    ${
      opts.sessionIndex
        ? `<saml:AuthnStatement SessionIndex="${this.esc(opts.sessionIndex)}"/>`
        : ''
    }
    <saml:AttributeStatement>${attrs}</saml:AttributeStatement>
    ${opts.signed !== false ? '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo/></ds:Signature>' : ''}
  </saml:Assertion>
</samlp:Response>`;
    return Buffer.from(xml, 'utf8').toString('base64');
  }

  /* ---------------------------------------------------------------- */

  private static extractAssertion(xml: string): SamlResponse {
    const issuer = this.matchText(xml, /<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/);
    const nameId = this.matchText(xml, /<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    if (!issuer || !nameId) {
      throw new SamlError('invalid_assertion', 'Missing Issuer or NameID in assertion');
    }
    const signatureValid = /<ds:Signature[\s>]/.test(xml);

    const attributes: Record<string, string[]> = {};
    const attrRe = /<saml:Attribute\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/saml:Attribute>/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(xml)) !== null) {
      const name = this.unesc(m[1]);
      const body = m[2];
      const values: string[] = [];
      const vRe = /<saml:AttributeValue[^>]*>([^<]*)<\/saml:AttributeValue>/g;
      let vm: RegExpExecArray | null;
      while ((vm = vRe.exec(body)) !== null) {
        values.push(this.unesc(vm[1]));
      }
      attributes[name] = values;
    }

    const notBefore = this.matchAttr(xml, /<saml:Conditions[^>]*NotBefore="([^"]+)"/);
    const notOnOrAfter = this.matchAttr(xml, /<saml:Conditions[^>]*NotOnOrAfter="([^"]+)"/);
    const audience = this.matchText(xml, /<saml:Audience[^>]*>([^<]+)<\/saml:Audience>/);
    const sessionIndex = this.matchAttr(xml, /<saml:AuthnStatement[^>]*SessionIndex="([^"]+)"/);
    const id = this.matchAttr(xml, /<samlp:Response[^>]*ID="([^"]+)"/) ?? createHash('sha1').update(xml).digest('hex').slice(0, 16);

    return {
      id,
      issuer: this.unesc(issuer),
      nameId: this.unesc(nameId),
      attributes,
      signatureValid,
      notBeforeMs: notBefore ? Date.parse(notBefore) : undefined,
      notOnOrAfterMs: notOnOrAfter ? Date.parse(notOnOrAfter) : undefined,
      audience: audience ? this.unesc(audience) : undefined,
      sessionIndex: sessionIndex ?? undefined,
    };
  }

  private static validateConditions(
    r: SamlResponse,
    nowMs: number,
    expectedAudience?: string
  ): void {
    if (r.notBeforeMs !== undefined && r.notBeforeMs > nowMs) {
      throw new SamlError('assertion_not_yet_valid', 'Assertion NotBefore is in the future', {
        notBefore: new Date(r.notBeforeMs).toISOString(),
      });
    }
    if (r.notOnOrAfterMs !== undefined && r.notOnOrAfterMs <= nowMs) {
      throw new SamlError('assertion_expired', 'Assertion expired', {
        notOnOrAfter: new Date(r.notOnOrAfterMs).toISOString(),
      });
    }
    if (expectedAudience && r.audience !== expectedAudience) {
      throw new SamlError('audience_mismatch', `Audience mismatch: ${r.audience}`, {
        expected: expectedAudience,
        got: r.audience,
      });
    }
  }

  private static matchText(xml: string, re: RegExp): string | undefined {
    const m = re.exec(xml);
    return m ? m[1] : undefined;
  }

  private static matchAttr(xml: string, re: RegExp): string | undefined {
    const m = re.exec(xml);
    return m ? m[1] : undefined;
  }

  private static esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private static unesc(s: string): string {
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
}
