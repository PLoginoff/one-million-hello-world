/**
 * WebAuthn-style Challenge-Response (stub cryptography)
 *
 * Models the FIDO2/WebAuthn ceremony without a real crypto dependency:
 *
 * Registration ("attestation")
 * --------------------------
 *   1. Server issues a `PublicKeyCredentialCreationOptions`-like challenge:
 *      random 32-byte nonce, RP id, user handle, timeout.
 *   2. Authenticator (stubbed via `IAuthenticator`) produces a credential:
 *      { credentialId, publicKey, signCount=0 } bound to (rpId, userHandle).
 *   3. Server stores the credential keyed by credentialId.
 *
 * Authentication ("assertion")
 * ----------------------------
 *   1. Server issues a `PublicKeyCredentialRequestOptions`-like challenge.
 *   2. Authenticator signs (challenge || rpId || signCount+1) — here the
 *      "signature" is a deterministic keyed digest stub (SHA-256 of the
 *      concatenated payload + private key), which is exactly the shape a
 *      real ECDSA P-256 verification would slot into behind `ISigner`.
 *   3. Server verifies: challenge match, rpId match, signature valid,
 *      signCount strictly increased (clone detection).
 *
 * Clone detection: authenticators expose a monotonically increasing
 * signature counter. If an assertion arrives with signCount <= stored,
 * either the device is cloned or replayed → credential is flagged.
 *
 * @module Mfa/Engine2
 */

/** Minimal byte-array helpers so the module is dependency-free. */
export interface Bytes {
  readonly bytes: Uint8Array;
}

/** A pluggable signature primitive — swap in real ECDSA later. */
export interface ISigner {
  /** Produce a signature over `payload` using `privateKey`. */
  sign(privateKey: Uint8Array, payload: Uint8Array): Uint8Array;
  /** Verify a signature produced by `sign`. */
  verify(publicKey: Uint8Array, payload: Uint8Array, signature: Uint8Array): boolean;
  /** Derive the public key for a private key. */
  publicKeyOf(privateKey: Uint8Array): Uint8Array;
}

/** Injectable randomness — deterministic in tests. */
export interface IRandomSource {
  bytes(n: number): Uint8Array;
}

/** Default RNG backed by crypto.getRandomValues when available. */
export class SystemRandomSource implements IRandomSource {
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => void } }).crypto;
    if (c?.getRandomValues) {
      c.getRandomValues(out);
    } else {
      for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    }
    return out;
  }
}

/** Deterministic RNG for tests — xorshift64*. */
export class SeededRandomSource implements IRandomSource {
  private state: bigint;
  constructor(seed = 0x9e3779b97f4a7c15n) {
    this.state = seed;
  }
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // xorshift64*
      this.state ^= this.state >> 12n;
      this.state ^= (this.state << 25n) & 0xffffffffffffffffn;
      this.state ^= this.state >> 27n;
      out[i] = Number(((this.state * 0x2545f4914f6cdd1dn) >> 56n) & 0xffn);
    }
    return out;
  }
}

/**
 * Stub signer — a real implementation would be ECDSA P-256 over SHA-256.
 * We simulate key-pair behaviour with a keyed SHA-256 construction:
 *   publicKey  = sha256("pub"  || privateKey)
 *   signature  = sha256("sig"  || privateKey || payload)
 *   verify     = sha256("sig"  || privateOf(publicKey) || payload) — impossible,
 * so instead we bind publicKey = privateKey in the stub (symmetric stub):
 * the point is the ceremony, not the primitive. Signer interface is the
 * seam where WebCrypto/node:crypto plugs in.
 */
export class StubSigner implements ISigner {
  /** In the stub, publicKey === privateKey (symmetric). */
  publicKeyOf(privateKey: Uint8Array): Uint8Array {
    return privateKey.slice();
  }
  sign(privateKey: Uint8Array, payload: Uint8Array): Uint8Array {
    return StubSigner.digest(concat(utf8('sig'), privateKey, payload));
  }
  verify(publicKey: Uint8Array, payload: Uint8Array, signature: Uint8Array): boolean {
    const expected = StubSigner.digest(concat(utf8('sig'), publicKey, payload));
    return timingSafeEqual(expected, signature);
  }

  /** Tiny synchronous SHA-256 (FIPS 180-4) — avoids async crypto APIs. */
  static digest(data: Uint8Array): Uint8Array {
    return sha256(data);
  }
}

/** A registered credential as the server stores it. */
export interface StoredCredential {
  readonly credentialId: string;
  readonly publicKey: Uint8Array;
  readonly userHandle: string;
  readonly rpId: string;
  signCount: number;
  /** Set when a signCount regression suggests a cloned authenticator. */
  cloned: boolean;
  readonly createdAt: number;
}

/** Server-issued registration challenge. */
export interface RegistrationChallenge {
  readonly challenge: string;
  readonly rpId: string;
  readonly userHandle: string;
  readonly userName: string;
  readonly expiresAt: number;
}

/** Server-issued assertion challenge. */
export interface AssertionChallenge {
  readonly challenge: string;
  readonly rpId: string;
  readonly expiresAt: number;
  readonly allowCredentials: readonly string[];
}

/** What an authenticator returns from registration. */
export interface AttestationResponse {
  readonly challenge: string;
  readonly credentialId: string;
  readonly publicKey: Uint8Array;
  readonly rpId: string;
  readonly userHandle: string;
}

/** What an authenticator returns from assertion. */
export interface AssertionResponse {
  readonly challenge: string;
  readonly credentialId: string;
  readonly rpId: string;
  readonly signCount: number;
  readonly signature: Uint8Array;
}

/**
 * A software "authenticator" — stands in for a platform authenticator or
 * roaming security key. Holds one private key per credentialId.
 */
export class SoftAuthenticator {
  private readonly keys = new Map<string, Uint8Array>();
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly signer: ISigner = new StubSigner(),
    private readonly rng: IRandomSource = new SystemRandomSource()
  ) {}

  /** Simulate the authenticator side of attestation. */
  attest(ch: RegistrationChallenge): AttestationResponse {
    const privateKey = this.rng.bytes(32);
    const credentialId = hex(this.rng.bytes(16));
    this.keys.set(credentialId, privateKey);
    this.counters.set(credentialId, 0);
    return {
      challenge: ch.challenge,
      credentialId,
      publicKey: this.signer.publicKeyOf(privateKey),
      rpId: ch.rpId,
      userHandle: ch.userHandle,
    };
  }

  /** Simulate the authenticator side of assertion. */
  assert(ch: AssertionChallenge, credentialId: string): AssertionResponse {
    const key = this.keys.get(credentialId);
    if (!key) throw new Error(`authenticator has no credential ${credentialId}`);
    const count = (this.counters.get(credentialId) ?? 0) + 1;
    this.counters.set(credentialId, count);
    const payload = assertionPayload(ch.challenge, ch.rpId, count);
    return {
      challenge: ch.challenge,
      credentialId,
      rpId: ch.rpId,
      signCount: count,
      signature: this.signer.sign(key, payload),
    };
  }
}

/** Verification outcome. */
export interface AssertionResult {
  readonly ok: boolean;
  readonly credentialId: string;
  readonly signCount: number;
  readonly reason?: string;
  /** True when a clone was detected (count regression). */
  readonly cloneDetected?: boolean;
}

/**
 * Server-side WebAuthn ceremony manager. Keeps pending challenges (single
 * use, TTL-bound) and the credential store.
 */
export class WebAuthnCeremony {
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly regChallenges = new Map<string, RegistrationChallenge>();
  private readonly assertChallenges = new Map<string, AssertionChallenge>();

  constructor(
    private readonly signer: ISigner = new StubSigner(),
    private readonly rng: IRandomSource = new SystemRandomSource(),
    private readonly clock: () => number = Date.now,
    private readonly challengeTtlMs = 60_000
  ) {}

  /** Issue a registration challenge for (rpId, user). */
  beginRegistration(rpId: string, userHandle: string, userName: string): RegistrationChallenge {
    const ch: RegistrationChallenge = {
      challenge: hex(this.rng.bytes(32)),
      rpId,
      userHandle,
      userName,
      expiresAt: this.clock() + this.challengeTtlMs,
    };
    this.regChallenges.set(ch.challenge, ch);
    return ch;
  }

  /** Complete registration: challenge must be pending and unexpired. */
  finishRegistration(resp: AttestationResponse): StoredCredential {
    const ch = this.regChallenges.get(resp.challenge);
    if (!ch) throw new WebAuthnError('unknown or consumed challenge');
    if (this.clock() > ch.expiresAt) throw new WebAuthnError('challenge expired');
    if (ch.rpId !== resp.rpId) throw new WebAuthnError('rpId mismatch');
    if (ch.userHandle !== resp.userHandle) throw new WebAuthnError('user handle mismatch');
    this.regChallenges.delete(resp.challenge); // single-use

    const cred: StoredCredential = {
      credentialId: resp.credentialId,
      publicKey: resp.publicKey.slice(),
      userHandle: resp.userHandle,
      rpId: resp.rpId,
      signCount: 0,
      cloned: false,
      createdAt: this.clock(),
    };
    this.credentials.set(cred.credentialId, cred);
    return cred;
  }

  /** Issue an assertion challenge, optionally scoped to credential ids. */
  beginAssertion(rpId: string, allowCredentials: readonly string[] = []): AssertionChallenge {
    const ch: AssertionChallenge = {
      challenge: hex(this.rng.bytes(32)),
      rpId,
      expiresAt: this.clock() + this.challengeTtlMs,
      allowCredentials,
    };
    this.assertChallenges.set(ch.challenge, ch);
    return ch;
  }

  /** Verify an assertion response. Consumes the challenge either way. */
  finishAssertion(resp: AssertionResponse): AssertionResult {
    const ch = this.assertChallenges.get(resp.challenge);
    this.assertChallenges.delete(resp.challenge);
    if (!ch) {
      return { ok: false, credentialId: resp.credentialId, signCount: 0, reason: 'unknown challenge' };
    }
    if (this.clock() > ch.expiresAt) {
      return { ok: false, credentialId: resp.credentialId, signCount: 0, reason: 'challenge expired' };
    }
    if (ch.rpId !== resp.rpId) {
      return { ok: false, credentialId: resp.credentialId, signCount: 0, reason: 'rpId mismatch' };
    }
    if (ch.allowCredentials.length > 0 && !ch.allowCredentials.includes(resp.credentialId)) {
      return { ok: false, credentialId: resp.credentialId, signCount: 0, reason: 'credential not allowed' };
    }
    const cred = this.credentials.get(resp.credentialId);
    if (!cred) {
      return { ok: false, credentialId: resp.credentialId, signCount: 0, reason: 'unknown credential' };
    }
    if (cred.cloned) {
      return { ok: false, credentialId: resp.credentialId, signCount: cred.signCount, reason: 'credential disabled (clone detected)' };
    }
    const payload = assertionPayload(resp.challenge, resp.rpId, resp.signCount);
    if (!this.signer.verify(cred.publicKey, payload, resp.signature)) {
      return { ok: false, credentialId: resp.credentialId, signCount: cred.signCount, reason: 'bad signature' };
    }
    if (resp.signCount <= cred.signCount) {
      cred.cloned = true;
      return {
        ok: false,
        credentialId: resp.credentialId,
        signCount: cred.signCount,
        reason: 'signCount regression',
        cloneDetected: true,
      };
    }
    cred.signCount = resp.signCount;
    return { ok: true, credentialId: resp.credentialId, signCount: resp.signCount };
  }

  /** Look up a registered credential. */
  credential(credentialId: string): StoredCredential | undefined {
    return this.credentials.get(credentialId);
  }

  /** All credential ids for a user handle. */
  credentialsFor(userHandle: string): readonly string[] {
    const out: string[] = [];
    for (const c of this.credentials.values()) {
      if (c.userHandle === userHandle) out.push(c.credentialId);
    }
    return out;
  }

  /** Remove a credential (e.g. user unenrolls a key). */
  removeCredential(credentialId: string): boolean {
    return this.credentials.delete(credentialId);
  }

  /** Purge expired pending challenges — call periodically. */
  gc(): number {
    const now = this.clock();
    let n = 0;
    for (const [k, v] of this.regChallenges) {
      if (v.expiresAt < now) {
        this.regChallenges.delete(k);
        n++;
      }
    }
    for (const [k, v] of this.assertChallenges) {
      if (v.expiresAt < now) {
        this.assertChallenges.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class WebAuthnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

/** The exact payload that gets signed: challenge || rpId || signCount. */
export function assertionPayload(challenge: string, rpId: string, signCount: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = signCount & 0xff;
  buf[1] = (signCount >> 8) & 0xff;
  buf[2] = (signCount >> 16) & 0xff;
  buf[3] = (signCount >> 24) & 0xff;
  return concat(utf8(challenge), utf8('|'), utf8(rpId), buf);
}

/* ------------------------------------------------------------------------ */
/* Byte utilities                                                           */
/* ------------------------------------------------------------------------ */

export function utf8(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function hex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    s += b[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Constant-time equality — avoids early-exit timing leak in verify. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Compact SHA-256 (FIPS 180-4). ~60 lines, synchronous, dependency-free —
 * sufficient for stub signatures and challenge digests. O(n) in input size.
 */
export function sha256(data: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const bitLen = data.length * 8;
  const paddedLen = (((data.length + 9 + 63) >> 6) << 6);
  const msg = new Uint8Array(paddedLen);
  msg.set(data);
  msg[data.length] = 0x80;
  // 64-bit length (we only support < 2^53, fine here)
  const dv = new DataView(msg.buffer);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunk + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v, false));
  return out;
}
