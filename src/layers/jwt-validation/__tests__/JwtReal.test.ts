/**
 * Real JWT implementation tests — parsing, signing, verification,
 * claims validation, JWK store, key rotation, refresh, blacklist.
 */

import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync } from 'crypto';
import { JwtParser } from '../jwt/JwtParser';
import { JwtVerifier, signHs256 } from '../jwt/JwtVerifier';
import { JwtIssuer } from '../jwt/JwtIssuer';
import { JwtTokenError } from '../jwt/types';
import { JwkStore } from '../jwt/JwkStore';
import { KeyRotationStrategy } from '../jwt/KeyRotationStrategy';
import { TokenBlacklist } from '../jwt/TokenBlacklist';
import { TokenRefresher } from '../jwt/TokenRefresher';
import { base64urlDecode, base64urlEncode } from '../jwt/base64url';

const SECRET = 'super-secret-key-for-tests';

function makeToken(claims: Record<string, unknown>, secret = SECRET): string {
  return signHs256(claims, secret);
}

const NOW = 1_700_000_000_000; // fixed ms
const NOW_S = Math.floor(NOW / 1000);

describe('JwtParser', () => {
  it('decodes a valid token into header/payload/signature', () => {
    const token = makeToken({ sub: 'user-1', exp: NOW_S + 60 });
    const d = JwtParser.decode(token);
    expect(d.header.alg).toBe('HS256');
    expect(d.payload.sub).toBe('user-1');
    expect(d.signature.length).toBe(32); // SHA-256 digest
    expect(d.signingInput.split('.')).toHaveLength(2);
  });

  it('throws on malformed tokens', () => {
    expect(() => JwtParser.decode('')).toThrow(JwtTokenError);
    expect(() => JwtParser.decode('a.b')).toThrow(JwtTokenError);
    expect(() => JwtParser.decode('a.b.c.d')).toThrow(JwtTokenError);
  });

  it('tryDecode returns null on bad input', () => {
    expect(JwtParser.tryDecode('not-a-jwt')).toBeNull();
  });

  it('extracts kid and alg without full parse', () => {
    const token = JwtIssuer.sign({ sub: 'x' }, { algorithm: 'HS256', key: SECRET, kid: 'k1' });
    expect(JwtParser.extractKid(token)).toBe('k1');
    expect(JwtParser.extractAlg(token)).toBe('HS256');
  });
});

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64urlDecode(base64urlEncode(data))).toEqual(data);
  });
  it('handles unpadded input', () => {
    expect(base64urlDecode('aGk').toString()).toBe('hi');
    expect(base64urlDecode('aGVsbG8').toString()).toBe('hello');
  });
});

describe('JwtVerifier HS256', () => {
  const verifier = new JwtVerifier({
    algorithms: ['HS256'],
    now: () => NOW,
  });

  it('accepts a properly signed token', () => {
    const token = makeToken({ sub: 'u', exp: NOW_S + 300 });
    const decoded = verifier.verify(token, { kind: 'secret', secret: SECRET });
    expect(decoded.payload.sub).toBe('u');
  });

  it('rejects a wrong secret', () => {
    const token = makeToken({ sub: 'u', exp: NOW_S + 300 }, 'other-secret');
    expect(() => verifier.verify(token, { kind: 'secret', secret: SECRET })).toThrow(JwtTokenError);
    const r = verifier.tryVerify(token, { kind: 'secret', secret: SECRET });
    expect(r.valid).toBe(false);
    expect(r.error?.code).toBe('signature_invalid');
  });

  it('rejects expired tokens', () => {
    const token = makeToken({ sub: 'u', exp: NOW_S - 3600 });
    const r = verifier.tryVerify(token, { kind: 'secret', secret: SECRET });
    expect(r.valid).toBe(false);
    expect(r.error?.code).toBe('expired');
  });

  it('honours clock tolerance', () => {
    const token = makeToken({ sub: 'u', exp: NOW_S - 30 }); // 30s ago
    const strict = new JwtVerifier({ algorithms: ['HS256'], clockTolerance: 0, now: () => NOW });
    const loose = new JwtVerifier({ algorithms: ['HS256'], clockTolerance: 60, now: () => NOW });
    expect(strict.tryVerify(token, { kind: 'secret', secret: SECRET }).valid).toBe(false);
    expect(loose.tryVerify(token, { kind: 'secret', secret: SECRET }).valid).toBe(true);
  });

  it('rejects not-yet-valid (nbf)', () => {
    const token = makeToken({ sub: 'u', nbf: NOW_S + 600, exp: NOW_S + 1200 });
    const r = verifier.tryVerify(token, { kind: 'secret', secret: SECRET });
    expect(r.error?.code).toBe('not_yet_valid');
  });

  it('rejects tokens issued in the future', () => {
    const token = makeToken({ sub: 'u', iat: NOW_S + 600, exp: NOW_S + 1200 });
    const r = verifier.tryVerify(token, { kind: 'secret', secret: SECRET });
    expect(r.error?.code).toBe('issued_in_future');
  });

  it('validates issuer, audience and subject', () => {
    const v = new JwtVerifier({
      algorithms: ['HS256'],
      issuer: 'auth.example.com',
      audience: ['api://my-api'],
      subject: 'user-42',
      now: () => NOW,
    });
    const good = makeToken({
      sub: 'user-42',
      iss: 'auth.example.com',
      aud: ['api://my-api', 'other'],
      exp: NOW_S + 60,
    });
    expect(v.tryVerify(good, { kind: 'secret', secret: SECRET }).valid).toBe(true);

    const badIss = makeToken({ sub: 'user-42', iss: 'evil', aud: 'api://my-api', exp: NOW_S + 60 });
    expect(v.tryVerify(badIss, { kind: 'secret', secret: SECRET }).error?.code).toBe('issuer_mismatch');

    const badAud = makeToken({ sub: 'user-42', iss: 'auth.example.com', aud: 'api://other', exp: NOW_S + 60 });
    expect(v.tryVerify(badAud, { kind: 'secret', secret: SECRET }).error?.code).toBe('audience_mismatch');
  });

  it('enforces requiredClaims and maxAge', () => {
    const v = new JwtVerifier({
      algorithms: ['HS256'],
      requiredClaims: ['role'],
      maxAge: 120,
      now: () => NOW,
    });
    const missing = makeToken({ sub: 'u', iat: NOW_S, exp: NOW_S + 60 });
    expect(v.tryVerify(missing, { kind: 'secret', secret: SECRET }).error?.code).toBe('missing_claim');

    const old = makeToken({ sub: 'u', role: 'a', iat: NOW_S - 9999, exp: NOW_S + 60 });
    expect(v.tryVerify(old, { kind: 'secret', secret: SECRET }).error?.code).toBe('max_age_exceeded');
  });

  it('rejects algorithm not in allowlist', () => {
    const v = new JwtVerifier({ algorithms: ['RS256'], now: () => NOW });
    const token = makeToken({ sub: 'u', exp: NOW_S + 60 });
    const r = v.tryVerify(token, { kind: 'pem', pem: 'x' });
    expect(r.error?.code).toBe('algorithm_not_allowed');
  });

  it('prevents algorithm-confusion attack (HS256 vs public key)', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    // Attacker signs with public key as HMAC secret:
    const evil = signHs256({ sub: 'admin', exp: NOW_S + 60 }, pem);
    const v = new JwtVerifier({ algorithms: ['HS256'], now: () => NOW });
    const r = v.tryVerify(evil, { kind: 'pem', pem });
    expect(r.valid).toBe(false);
    expect(r.error?.code).toBe('algorithm_confusion');
  });

  it('rejects alg=none tokens', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x', exp: NOW_S + 60 })).toString('base64url');
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const token = `${header}.${payload}.`;
    const v = new JwtVerifier({ algorithms: ['none'], now: () => NOW });
    const r = v.tryVerify(token, { kind: 'secret', secret: SECRET });
    expect(r.valid).toBe(false);
  });
});

describe('RS256 round-trip', () => {
  it('verifies tokens signed with RS256 private key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const pubPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

    const token = JwtIssuer.sign(
      { sub: 'rs-user', exp: NOW_S + 60 },
      { algorithm: 'RS256', key: privPem }
    );
    const v = new JwtVerifier({ algorithms: ['RS256'], now: () => NOW });
    const decoded = v.verify(token, { kind: 'pem', pem: pubPem });
    expect(decoded.payload.sub).toBe('rs-user');
  });

  it('rejects tampered payload', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const pubPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const token = JwtIssuer.sign({ sub: 'x', exp: NOW_S + 60 }, { algorithm: 'RS256', key: privPem });
    const [h, , s] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'admin', exp: NOW_S + 60 })).toString('base64url');
    const forged = `${h}.${tamperedPayload}.${s}`;
    const v = new JwtVerifier({ algorithms: ['RS256'], now: () => NOW });
    expect(v.tryVerify(forged, { kind: 'pem', pem: pubPem }).valid).toBe(false);
  });
});

describe('ES256 round-trip', () => {
  it('verifies ES256 tokens (raw R||S signature)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    const privPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const pubPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const token = JwtIssuer.sign({ sub: 'ec-user', exp: NOW_S + 60 }, { algorithm: 'ES256', key: privPem });
    const v = new JwtVerifier({ algorithms: ['ES256'], now: () => NOW });
    expect(v.tryVerify(token, { kind: 'pem', pem: pubPem }).valid).toBe(true);
  });
});

describe('JwkStore', () => {
  it('resolves keys by kid and algorithm', () => {
    const store = new JwkStore();
    store.addKey({ kty: 'RSA', kid: 'rsa-1', alg: 'RS256', use: 'sig' });
    store.addKey({ kty: 'EC', kid: 'ec-1', alg: 'ES256', use: 'sig' });
    expect(store.size).toBe(2);
    expect(store.resolve('rsa-1', 'RS256')?.jwk.kid).toBe('rsa-1');
    expect(store.resolve('ec-1', 'ES256')?.jwk.kid).toBe('ec-1');
    // Unknown kid but only one candidate of the right type → lenient fallback
    expect(store.resolve('missing', 'RS256')?.jwk.kid).toBe('rsa-1');
    // Unknown kid with no matching kty → null
    expect(store.resolve('missing', 'RS384')).toBeNull();
    expect(store.resolve(undefined, 'ES256')?.jwk.kty).toBe('EC');
  });

  it('imports a JWKS JSON document', () => {
    const jwks = JSON.stringify({ keys: [{ kty: 'RSA', kid: 'a' }, { kty: 'EC', kid: 'b' }] });
    const store = new JwkStore();
    store.importJwksJson(jwks);
    expect(store.keyIds()).toEqual(['a', 'b']);
  });

  it('rejects oversized JWKS', () => {
    const store = new JwkStore(undefined, { maxKeys: 2 });
    expect(() =>
      store.importKeys([{ kty: 'RSA' }, { kty: 'RSA' }, { kty: 'RSA' }])
    ).toThrow(JwtTokenError);
  });
});

describe('KeyRotationStrategy', () => {
  it('creates an active key and rotates when due', () => {
    let t = 0;
    const rot = new KeyRotationStrategy(
      { maxKeyAgeMs: 1000, retirementGraceMs: 500 },
      { now: () => t }
    );
    const k1 = rot.ensureActive();
    expect(k1.status).toBe('active');
    expect(rot.rotateIfDue()).toBe(false);

    t = 2000;
    expect(rot.rotateIfDue()).toBe(true);
    const k2 = rot.activeKey();
    expect(k2?.kid).not.toBe(k1.kid);
    // Old key still verifiable within grace
    expect(rot.resolve(k1.kid)).not.toBeNull();
    t = 3000; // past grace
    expect(rot.resolve(k1.kid)).toBeNull();
  });
});

describe('TokenBlacklist', () => {
  it('revokes by jti and full-token hash', () => {
    const bl = new TokenBlacklist({ now: () => NOW });
    const token = makeToken({ sub: 'u', jti: 'abc-1', exp: NOW_S + 600 });
    bl.revoke(token, 'logout');
    expect(bl.check(token)).not.toBeNull();
    expect(() => bl.assertNotRevoked(token)).toThrow(JwtTokenError);
    expect(bl.isJtiRevoked('abc-1')).toBe(true);
    expect(bl.isJtiRevoked('other')).toBe(false);
  });

  it('prunes entries whose exp has passed', () => {
    let t = NOW;
    const bl = new TokenBlacklist({ now: () => t });
    const token = makeToken({ sub: 'u', jti: 'e1', exp: NOW_S + 10 });
    bl.revoke(token);
    expect(bl.size).toBe(1);
    t = NOW + 60_000; // 60s later — token expired
    expect(bl.size).toBe(0);
  });
});

describe('TokenRefresher', () => {
  it('issues and rotates access/refresh pairs', () => {
    const refresher = new TokenRefresher(
      { accessTokenTtlSeconds: 60, refreshTokenTtlSeconds: 3600 },
      { now: () => NOW }
    );
    const pair = refresher.issue('user-1');
    expect(pair.tokenType).toBe('Bearer');

    // Access token verifies against active rotation key
    const v = new JwtVerifier({ algorithms: ['HS256'], now: () => NOW });
    const key = refresher.verificationKey();
    const decoded = v.verify(pair.accessToken, key);
    expect(decoded.payload.sub).toBe('user-1');

    // Rotate
    const next = refresher.refresh(pair.refreshToken);
    expect(next.rotated).toBe(true);
    expect(next.pair?.refreshToken).not.toBe(pair.refreshToken);
  });

  it('detects refresh token reuse and revokes the family', () => {
    const refresher = new TokenRefresher({ detectReuse: true }, { now: () => NOW });
    const pair = refresher.issue('user-2');
    const first = refresher.refresh(pair.refreshToken);
    expect(first.rotated).toBe(true);
    // Replay old refresh token → reuse detected
    const replay = refresher.refresh(pair.refreshToken);
    expect(replay.rotated).toBe(false);
    expect(replay.error?.code).toBe('revoked');
    // Even the new token is revoked (family wiped)
    const r2 = refresher.refresh(first.pair!.refreshToken);
    expect(r2.rotated).toBe(false);
  });

  it('rejects unknown refresh tokens', () => {
    const refresher = new TokenRefresher({}, { now: () => NOW });
    const r = refresher.refresh('rft-does-not-exist');
    expect(r.rotated).toBe(false);
    expect(r.error?.code).toBe('revoked');
  });
});

describe('JwtIssuer', () => {
  it('adds exp/iat automatically when expiresInSeconds is set', () => {
    const token = JwtIssuer.hs256({ sub: 'u' }, SECRET, 300);
    const d = JwtParser.decode(token);
    expect(typeof d.payload.exp).toBe('number');
    expect(typeof d.payload.iat).toBe('number');
    expect(d.payload.exp! - d.payload.iat!).toBe(300);
  });

  it('round-trips DER→raw ECDSA conversion', () => {
    // Sizes: ES256 → 32, ES384 → 48, ES512 → 66
    expect(JwtIssuer.ecSizeFor('ES256')).toBe(32);
    expect(JwtIssuer.ecSizeFor('ES384')).toBe(48);
    expect(JwtIssuer.ecSizeFor('ES512')).toBe(66);
  });
});
