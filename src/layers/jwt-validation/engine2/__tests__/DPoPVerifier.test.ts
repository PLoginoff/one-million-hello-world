/**
 * Tests for DPoPVerifier (RFC 9449).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createHash } from 'crypto';
import { DPoPVerifier } from '../DPoPVerifier';
import { jwkThumbprint } from '../TokenBinding';
import { ManualJwtClock2 } from '../types';
import { JsonWebKeyObject } from '../../jwt/types';

const b64u = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

const JWK: JsonWebKeyObject = { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' };

function makeProof(over: {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  iat?: number;
} = {}): string {
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: JWK, ...over.header };
  const { jti = 'jti-1', iat: payloadIat, ...restPayload } = over.payload ?? {};
  const payload = {
    jti,
    htm: 'GET',
    htu: 'https://api.example.com/data',
    iat: over.iat ?? payloadIat ?? Math.floor(Date.now() / 1000),
    ...restPayload,
  };
  return `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}.fakesig`;
}

describe('DPoPVerifier', () => {
  let clock: ManualJwtClock2;
  let verifier: DPoPVerifier;
  const nowSec = 1_000_000;

  beforeEach(() => {
    clock = new ManualJwtClock2(nowSec * 1000);
    verifier = new DPoPVerifier({ maxAgeSec: 60, clockSkewSec: 30, clock });
  });

  const proof = (over: Parameters<typeof makeProof>[0] = {}) =>
    makeProof({ ...over, iat: over.iat ?? nowSec });

  it('accepts a well-formed proof', () => {
    const out = verifier.verify(proof(), 'GET', 'https://api.example.com/data');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.jkt).toBe(jwkThumbprint(JWK));
  });

  it('rejects wrong typ', () => {
    const out = verifier.verify(proof({ header: { typ: 'jwt' } }), 'GET', 'https://api.example.com/data');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('dpop+jwt');
  });

  it('rejects symmetric and none algs', () => {
    for (const alg of ['HS256', 'none']) {
      const out = verifier.verify(proof({ header: { alg } }), 'GET', 'https://api.example.com/data');
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toContain('asymmetric');
    }
  });

  it('rejects proofs older than maxAgeSec', () => {
    const out = verifier.verify(proof({ iat: nowSec - 61 }), 'GET', 'https://api.example.com/data');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('older');
  });

  it('rejects future iat beyond skew', () => {
    const ok = verifier.verify(proof({ iat: nowSec + 20 }), 'GET', 'https://api.example.com/data');
    expect(ok.ok).toBe(true);
    const bad = verifier.verify(
      proof({ iat: nowSec + 40, payload: { jti: 'jti-2' } }),
      'GET',
      'https://api.example.com/data'
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('future');
  });

  it('rejects htm/htu mismatch', () => {
    const m = verifier.verify(proof(), 'POST', 'https://api.example.com/data');
    expect(m.ok).toBe(false);
    const u = verifier.verify(
      proof({ payload: { jti: 'jti-2', htu: 'https://api.example.com/other' } }),
      'GET',
      'https://api.example.com/data'
    );
    expect(u.ok).toBe(false);
  });

  it('htu ignores query string', () => {
    const out = verifier.verify(proof(), 'GET', 'https://api.example.com/data?x=1&y=2');
    expect(out.ok).toBe(true);
  });

  it('rejects replayed jti within the window', () => {
    const p = proof();
    expect(verifier.verify(p, 'GET', 'https://api.example.com/data').ok).toBe(true);
    const replay = verifier.verify(p, 'GET', 'https://api.example.com/data');
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toContain('replay');
    // After maxAge the jti is forgotten.
    clock.advance(61_000);
    // iat would now be stale — fresh proof, same jti still blocked? The
    // cache entry expired so a *new* proof with same jti passes replay,
    // but iat freshness applies to the new iat.
    const fresh = proof({ iat: nowSec + 61 });
    const out = verifier.verify(fresh, 'GET', 'https://api.example.com/data');
    expect(out.ok).toBe(true);
  });

  it('rejects private key material in embedded JWK', () => {
    const out = verifier.verify(
      proof({ header: { jwk: { ...JWK, d: 'secret' } } }),
      'GET',
      'https://api.example.com/data'
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('private');
  });

  it('enforces cnf.jkt binding to the access token', () => {
    const claims = { cnf: { jkt: jwkThumbprint(JWK)! } };
    expect(verifier.verify(proof(), 'GET', 'https://api.example.com/data', { claims }).ok).toBe(true);
    const wrong = verifier.verify(
      proof({ payload: { jti: 'jti-2' } }),
      'GET',
      'https://api.example.com/data',
      { claims: { cnf: { jkt: 'other-thumbprint' } } }
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toContain('cnf.jkt');
  });

  it('verifies ath binding when provided', () => {
    const raw = 'access-token-string';
    const ath = createHash('sha256').update(raw).digest('base64url');
    const p = proof({ payload: { ath } });
    const out = verifier.verify(p, 'GET', 'https://api.example.com/data', {
      claims: {},
      raw,
    });
    expect(out.ok).toBe(true);
    const badAth = proof({ payload: { jti: 'jti-2', ath: 'wrong' } });
    const out2 = verifier.verify(badAth, 'GET', 'https://api.example.com/data', { claims: {}, raw });
    expect(out2.ok).toBe(false);
    if (!out2.ok) expect(out2.reason).toContain('ath');
  });

  it('delegates signature verification to the injected verifier', () => {
    const strict = new DPoPVerifier({ verifySignature: () => false, clock });
    const out = strict.verify(proof(), 'GET', 'https://api.example.com/data');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('signature');
  });
});
