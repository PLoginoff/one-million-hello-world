/**
 * JwtVerifier — signature verification + claims validation.
 *
 * Algorithm-confusion prevention: the caller supplies the allowed algorithm
 * list; the verifier refuses tokens whose `alg` is not in the list AND whose
 * algorithm family does not match the provided key material (e.g. an HMAC
 * token presented to an RSA public key).
 */

import { createHmac, createPublicKey, createVerify, timingSafeEqual, constants } from 'crypto';
import { JwtParser } from './JwtParser';
import {
  ALGORITHM_FAMILY,
  ALGORITHM_HASH,
  DecodedJwt,
  isRecord,
  JwtAlgorithm,
  JwtClaims,
  JwtTokenError,
  JwtValidationOptions,
  JwtVerificationResult,
} from './types';

/** Key material supplied by the caller. */
export type VerificationKey =
  | { kind: 'secret'; secret: string | Buffer }
  | { kind: 'pem'; pem: string | Buffer }
  | { kind: 'jwk'; jwk: import('./types').JsonWebKeyObject };

export class JwtVerifier {
  private readonly options: Required<
    Pick<JwtValidationOptions, 'clockTolerance' | 'requireExpiration'>
  > &
    JwtValidationOptions;

  constructor(options: JwtValidationOptions) {
    if (!options.algorithms || options.algorithms.length === 0) {
      throw new Error('JwtVerifier requires a non-empty `algorithms` allowlist');
    }
    this.options = {
      clockTolerance: 60,
      requireExpiration: false,
      ...options,
    };
  }

  /**
   * Verify signature and validate claims. Throws JwtTokenError on any failure.
   */
  verify(token: string, key: VerificationKey): DecodedJwt {
    const decoded = JwtParser.decode(token);
    this.checkAlgorithm(decoded, key);
    this.verifySignature(decoded, key);
    this.validateClaims(decoded.payload);
    return decoded;
  }

  /**
   * Non-throwing variant — returns a result object.
   */
  tryVerify(token: string, key: VerificationKey): JwtVerificationResult {
    try {
      const decoded = this.verify(token, key);
      return { valid: true, decoded, kid: decoded.header.kid };
    } catch (err) {
      if (err instanceof JwtTokenError) {
        return { valid: false, error: err };
      }
      return {
        valid: false,
        error: new JwtTokenError(
          'signature_verification_failed',
          `Unexpected verification error: ${(err as Error).message}`
        ),
      };
    }
  }

  /* ---------------------------------------------------------------- */

  private checkAlgorithm(decoded: DecodedJwt, key: VerificationKey): void {
    const alg = decoded.header.alg;
    if (!this.options.algorithms.includes(alg)) {
      throw new JwtTokenError(
        'algorithm_not_allowed',
        `Algorithm ${alg} is not in the allowlist`,
        { allowed: this.options.algorithms }
      );
    }

    // Algorithm-confusion prevention: the algorithm family must be
    // compatible with the key material supplied.
    const family = ALGORITHM_FAMILY[alg];
    const isSymmetricKey = key.kind === 'secret';
    const isAsymmetricKey = key.kind === 'pem' || key.kind === 'jwk';

    if (family === 'hmac' && isAsymmetricKey) {
      // Classic attack: attacker knows the public key and signs an HS256
      // token with it as the HMAC secret. Refuse.
      throw new JwtTokenError(
        'algorithm_confusion',
        'HMAC algorithm presented but asymmetric key supplied — possible algorithm confusion attack'
      );
    }
    if ((family === 'rsa' || family === 'ec' || family === 'rsa-pss' || family === 'eddsa') && isSymmetricKey) {
      throw new JwtTokenError(
        'algorithm_confusion',
        'Asymmetric algorithm presented but symmetric secret supplied'
      );
    }
    if (family === 'none') {
      throw new JwtTokenError(
        'algorithm_not_allowed',
        'Unsigned tokens (alg=none) are never accepted'
      );
    }
  }

  private verifySignature(decoded: DecodedJwt, key: VerificationKey): void {
    const alg = decoded.header.alg;
    const family = ALGORITHM_FAMILY[alg];

    if (family === 'hmac') {
      const secret = key.kind === 'secret' ? key.secret : undefined;
      if (secret === undefined) {
        throw new JwtTokenError('algorithm_confusion', 'HMAC verification requires a secret key');
      }
      const expected = createHmac(ALGORITHM_HASH[alg], secret)
        .update(decoded.signingInput)
        .digest();
      if (expected.length !== decoded.signature.length || !timingSafeEqual(expected, decoded.signature)) {
        throw new JwtTokenError('signature_invalid', 'HMAC signature mismatch');
      }
      return;
    }

    if (family === 'rsa' || family === 'ec' || family === 'rsa-pss' || family === 'eddsa') {
      const verify = createVerify(ALGORITHM_HASH[alg]);
      verify.update(decoded.signingInput);
      verify.end();

      let keyObject: import('crypto').KeyObject;
      if (key.kind === 'pem') {
        keyObject = createPublicKey(key.pem);
      } else if (key.kind === 'jwk') {
        // Import JWK via createPublicKey — Node supports JWK objects.
        keyObject = createPublicKey({ key: key.jwk as never, format: 'jwk' });
      } else {
        throw new JwtTokenError(
          'algorithm_confusion',
          'Asymmetric verification requires a PEM or JWK key'
        );
      }

      let ok = false;
      try {
        if (family === 'rsa-pss') {
          ok = verify.verify(
            {
              key: keyObject,
              padding: constants.RSA_PKCS1_PSS_PADDING,
              saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
            },
            decoded.signature
          );
        } else if (family === 'ec') {
          ok = verify.verify(
            { key: keyObject, dsaEncoding: 'ieee-p1363' },
            decoded.signature
          );
        } else {
          ok = verify.verify(keyObject, decoded.signature);
        }
      } catch (err) {
        throw new JwtTokenError(
          'signature_verification_failed',
          `Signature verification threw: ${(err as Error).message}`
        );
      }
      if (!ok) {
        throw new JwtTokenError('signature_invalid', `${alg} signature mismatch`);
      }
      return;
    }

    throw new JwtTokenError('algorithm_not_allowed', `Unsupported algorithm family ${family}`);
  }

  /* ---------------------------------------------------------------- */

  private nowSeconds(): number {
    const now = this.options.now ? this.options.now() : Date.now();
    return Math.floor(now / 1000);
  }

  private validateClaims(claims: JwtClaims): void {
    const now = this.nowSeconds();
    const tol = this.options.clockTolerance;

    // exp — expiry
    if (claims.exp !== undefined) {
      if (typeof claims.exp !== 'number') {
        throw new JwtTokenError('invalid_payload', 'exp must be a numeric date');
      }
      if (now - tol >= claims.exp) {
        throw new JwtTokenError(
          'expired',
          `Token expired at ${new Date(claims.exp * 1000).toISOString()}`,
          { exp: claims.exp, now }
        );
      }
    } else if (this.options.requireExpiration) {
      throw new JwtTokenError('missing_expiration', 'Token has no exp claim');
    }

    // nbf — not before
    if (claims.nbf !== undefined) {
      if (typeof claims.nbf !== 'number') {
        throw new JwtTokenError('invalid_payload', 'nbf must be a numeric date');
      }
      if (now + tol < claims.nbf) {
        throw new JwtTokenError('not_yet_valid', 'Token is not yet valid', {
          nbf: claims.nbf,
          now,
        });
      }
    }

    // iat — issued at (reject future issues beyond tolerance)
    if (claims.iat !== undefined) {
      if (typeof claims.iat !== 'number') {
        throw new JwtTokenError('invalid_payload', 'iat must be a numeric date');
      }
      if (claims.iat - tol > now) {
        throw new JwtTokenError('issued_in_future', 'Token was issued in the future', {
          iat: claims.iat,
          now,
        });
      }
      // maxAge — token must have been issued within maxAge seconds
      if (this.options.maxAge !== undefined && now - claims.iat > this.options.maxAge + tol) {
        throw new JwtTokenError('max_age_exceeded', 'Token exceeds maximum allowed age', {
          iat: claims.iat,
          maxAge: this.options.maxAge,
        });
      }
    }

    // iss — issuer
    if (this.options.issuer !== undefined) {
      const allowed = Array.isArray(this.options.issuer) ? this.options.issuer : [this.options.issuer];
      if (typeof claims.iss !== 'string' || !allowed.includes(claims.iss)) {
        throw new JwtTokenError('issuer_mismatch', `Issuer mismatch: ${String(claims.iss)}`, {
          expected: allowed,
          got: claims.iss,
        });
      }
    }

    // aud — audience
    if (this.options.audience !== undefined) {
      const expected = Array.isArray(this.options.audience) ? this.options.audience : [this.options.audience];
      const tokenAud = claims.aud;
      const tokenAudArr = Array.isArray(tokenAud) ? tokenAud : tokenAud !== undefined ? [tokenAud] : [];
      const matched = tokenAudArr.some((a) => typeof a === 'string' && expected.includes(a));
      if (!matched) {
        throw new JwtTokenError(
          'audience_mismatch',
          `Audience mismatch: ${JSON.stringify(tokenAud)}`,
          { expected, got: tokenAud }
        );
      }
    }

    // sub — subject
    if (this.options.subject !== undefined && claims.sub !== this.options.subject) {
      throw new JwtTokenError('subject_mismatch', `Subject mismatch: ${String(claims.sub)}`);
    }

    // required claims
    if (this.options.requiredClaims) {
      for (const c of this.options.requiredClaims) {
        if (!(c in claims) || claims[c] === undefined) {
          throw new JwtTokenError('missing_claim', `Required claim missing: ${c}`, {
            claim: c,
          });
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Helpers                                                            *
 * ------------------------------------------------------------------ */

/** Build an HS256 token for tests / dev. */
export function signHs256(payload: Record<string, unknown>, secret: string | Buffer, header?: Record<string, unknown>): string {
  const hdr = { alg: 'HS256', typ: 'JWT', ...(header ?? {}) };
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  const input = `${enc(hdr)}.${enc(payload)}`;
  const sig = createHmac('sha256', secret)
    .update(input)
    .digest()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${input}.${sig}`;
}

/** Simple structural check that a value looks like a decoded JWT payload. */
export function looksLikeClaims(value: unknown): value is JwtClaims {
  return isRecord(value);
}
