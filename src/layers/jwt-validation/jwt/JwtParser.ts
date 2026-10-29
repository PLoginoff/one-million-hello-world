/**
 * JwtParser — decode JWT structure (header.payload.signature) without
 * verifying the signature. Use `JwtVerifier` for full validation.
 */

import {
  base64urlDecode,
  base64urlDecodeJson,
} from './base64url';
import {
  DecodedJwt,
  isJwtAlgorithm,
  isJwtClaims,
  isRecord,
  JwtClaims,
  JwtHeader,
  JwtTokenError,
} from './types';

export class JwtParser {
  /**
   * Parse a compact JWT string. Throws JwtTokenError on malformed input.
   */
  static decode(token: string): DecodedJwt {
    if (typeof token !== 'string' || token.length === 0) {
      throw new JwtTokenError('malformed', 'Token is empty or not a string');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new JwtTokenError(
        'malformed',
        `JWT must have 3 segments, got ${parts.length}`
      );
    }

    const [headerSeg, payloadSeg, signatureSeg] = parts;
    if (!headerSeg || !payloadSeg) {
      throw new JwtTokenError('malformed', 'Empty header or payload segment');
    }

    const header = this.parseHeader(headerSeg);
    const payload = this.parsePayload(payloadSeg);
    const signature = this.parseSignature(signatureSeg);

    return {
      header,
      payload,
      signingInput: `${headerSeg}.${payloadSeg}`,
      signature,
      token,
    };
  }

  /**
   * Try to decode without throwing. Returns null on malformed input.
   */
  static tryDecode(token: string): DecodedJwt | null {
    try {
      return this.decode(token);
    } catch {
      return null;
    }
  }

  /**
   * Extract just the unverified payload claims. Never trust these without
   * verifying the signature — exposed for inspection/debug only.
   */
  static unsafeClaims(token: string): JwtClaims {
    return this.decode(token).payload;
  }

  /**
   * Extract the `kid` header without full parse. Returns undefined if absent.
   */
  static extractKid(token: string): string | undefined {
    const dot = token.indexOf('.');
    if (dot <= 0) return undefined;
    try {
      const header = base64urlDecodeJson<unknown>(token.slice(0, dot));
      if (isRecord(header) && typeof header['kid'] === 'string') {
        return header['kid'];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract the `alg` header without full parse.
   */
  static extractAlg(token: string): string | undefined {
    const dot = token.indexOf('.');
    if (dot <= 0) return undefined;
    try {
      const header = base64urlDecodeJson<unknown>(token.slice(0, dot));
      if (isRecord(header) && typeof header['alg'] === 'string') {
        return header['alg'];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private static parseHeader(segment: string): JwtHeader {
    let raw: unknown;
    try {
      raw = base64urlDecodeJson(segment);
    } catch (err) {
      throw new JwtTokenError(
        'invalid_header',
        `Header is not valid JSON: ${(err as Error).message}`
      );
    }
    if (!isRecord(raw)) {
      throw new JwtTokenError('invalid_header', 'Header must be a JSON object');
    }
    const alg = raw['alg'];
    if (!isJwtAlgorithm(alg)) {
      throw new JwtTokenError(
        'invalid_header',
        `Header alg must be a recognised algorithm, got: ${String(alg)}`
      );
    }
    const header: JwtHeader = { alg };
    if (typeof raw['typ'] === 'string') header.typ = raw['typ'];
    if (typeof raw['cty'] === 'string') header.cty = raw['cty'];
    if (typeof raw['kid'] === 'string') header.kid = raw['kid'];
    if (typeof raw['jku'] === 'string') header.jku = raw['jku'];
    if (typeof raw['x5u'] === 'string') header.x5u = raw['x5u'];
    if (typeof raw['x5t'] === 'string') header.x5t = raw['x5t'];
    if (Array.isArray(raw['crit'])) {
      header.crit = raw['crit'].filter((c): c is string => typeof c === 'string');
    }
    return header;
  }

  private static parsePayload(segment: string): JwtClaims {
    let raw: unknown;
    try {
      raw = base64urlDecodeJson(segment);
    } catch (err) {
      throw new JwtTokenError(
        'invalid_payload',
        `Payload is not valid JSON: ${(err as Error).message}`
      );
    }
    if (!isJwtClaims(raw)) {
      throw new JwtTokenError('invalid_payload', 'Payload must be a JSON object');
    }
    return raw;
  }

  private static parseSignature(segment: string): Buffer {
    if (segment.length === 0) {
      // `alg: none` has an empty signature segment
      return Buffer.alloc(0);
    }
    try {
      return base64urlDecode(segment);
    } catch (err) {
      throw new JwtTokenError(
        'malformed',
        `Signature is not valid base64url: ${(err as Error).message}`
      );
    }
  }
}
