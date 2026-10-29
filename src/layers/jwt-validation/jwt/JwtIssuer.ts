/**
 * JwtIssuer — sign tokens with HS256/RS256/ES256.
 */

import { createSign, createHmac, KeyObject } from 'crypto';
import { base64urlEncodeJson, base64urlEncode } from './base64url';
import { ALGORITHM_HASH, JwtAlgorithm, JwtClaims } from './types';

export interface SignOptions {
  algorithm: JwtAlgorithm;
  key: string | Buffer | KeyObject;
  kid?: string;
  typ?: string;
  expiresInSeconds?: number;
  notBeforeSeconds?: number;
}

export class JwtIssuer {
  /**
   * Sign a JWT. Supports:
   *  - HS256/384/512: key is the HMAC secret.
   *  - RS256/384/512, PS256/384/512: key is a PEM private key.
   *  - ES256/384/512: key is an EC private key PEM (signature is emitted in
   *    JOSE raw R||S format, not DER).
   */
  static sign(claims: JwtClaims, opts: SignOptions): string {
    const header: Record<string, unknown> = {
      alg: opts.algorithm,
      typ: opts.typ ?? 'JWT',
    };
    if (opts.kid) header['kid'] = opts.kid;

    const now = Math.floor(Date.now() / 1000);
    const payload: JwtClaims = { ...claims };
    if (opts.expiresInSeconds !== undefined && payload.exp === undefined) {
      payload.iat = payload.iat ?? now;
      payload.exp = now + opts.expiresInSeconds;
    }
    if (opts.notBeforeSeconds !== undefined && payload.nbf === undefined) {
      payload.nbf = now + opts.notBeforeSeconds;
    }

    const signingInput = `${base64urlEncodeJson(header)}.${base64urlEncodeJson(payload)}`;
    const signature = this.computeSignature(signingInput, opts);
    return `${signingInput}.${signature}`;
  }

  private static computeSignature(signingInput: string, opts: SignOptions): string {
    const alg = opts.algorithm;
    const hash = ALGORITHM_HASH[alg];

    if (alg.startsWith('HS')) {
      return base64urlEncode(
        createHmac(hash, opts.key as string | Buffer).update(signingInput).digest()
      );
    }

    if (alg.startsWith('RS') || alg.startsWith('PS')) {
      const signer = createSign(hash);
      signer.update(signingInput);
      signer.end();
      const keyObj =
        alg.startsWith('PS')
          ? { key: opts.key, padding: 6 /* RSA_PKCS1_PSS_PADDING */ }
          : opts.key;
      const sig = signer.sign(keyObj as Parameters<typeof signer.sign>[0]);
      return base64urlEncode(sig);
    }

    if (alg.startsWith('ES')) {
      const signer = createSign(hash);
      signer.update(signingInput);
      signer.end();
      // Emit raw R||S form (JOSE) instead of DER.
      const raw = signer.sign({
        key: opts.key as KeyObject,
        dsaEncoding: 'ieee-p1363',
      });
      return base64urlEncode(raw);
    }

    if (alg === 'EdDSA') {
      // Ed25519 has no pre-hash — Node's crypto.sign handles it directly.
      const { sign: nodeSign } = require('crypto') as typeof import('crypto');
      const sig = nodeSign(null, Buffer.from(signingInput), opts.key as KeyObject);
      return base64urlEncode(sig);
    }

    throw new Error(`Cannot sign with algorithm ${alg}`);
  }

  /**
   * Convert a DER-encoded ECDSA signature to JOSE raw form (R||S).
   */
  static derToRaw(der: Buffer, size: number): Buffer {
    // Minimal DER parser for SEQUENCE { INTEGER r, INTEGER s }
    let offset = 0;
    if (der[offset++] !== 0x30) throw new Error('Invalid DER signature');
    // length
    let len = der[offset++];
    if (len & 0x80) {
      const bytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < bytes; i++) len = (len << 8) | der[offset++];
    }
    const readInt = (): Buffer => {
      if (der[offset++] !== 0x02) throw new Error('Invalid DER integer');
      const ilen = der[offset++];
      const val = der.slice(offset, offset + ilen);
      offset += ilen;
      return val;
    };
    const r = readInt();
    const s = readInt();
    const out = Buffer.alloc(size * 2);
    r.copy(out, size - r.length);
    s.copy(out, size * 2 - s.length);
    return out;
  }

  /** Raw R||S byte length per curve. */
  static ecSizeFor(alg: JwtAlgorithm): number {
    switch (alg) {
      case 'ES256':
        return 32;
      case 'ES384':
        return 48;
      case 'ES512':
        return 66; // P-521 uses 66 bytes
      default:
        return 32;
    }
  }

  /** Convenience — HS256 sign. */
  static hs256(claims: JwtClaims, secret: string | Buffer, expiresInSeconds?: number): string {
    return this.sign(claims, {
      algorithm: 'HS256',
      key: secret,
      expiresInSeconds,
    });
  }
}
