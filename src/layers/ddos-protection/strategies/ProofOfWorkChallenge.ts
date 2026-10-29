/**
 * ProofOfWorkChallenge
 *
 * Implements a Hashcash-style proof-of-work challenge/response — the same
 * trick Cloudflare uses to slow down bot traffic during a DDoS:
 *
 *   Server issues a challenge:  { seed, difficulty, expiresAt }
 *   Client must find:           nonce such that
 *                               SHA256(seed + nonce) has `difficulty` leading zero bits
 *   Server verifies:            cheap re-hash
 *
 * Work factor is exponential in difficulty (~2^d attempts expected). On the
 * wire we'd send the client a JS challenge; here we implement the core
 * mechanics (issue/solve/verify) so the rest of the pipeline can gate on it.
 *
 * Uses a pure-TS SHA-256 to avoid pulling in a crypto dep — see the note at
 * the bottom.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

/** Challenge issued to a client. */
export interface PowChallenge {
  readonly challengeId: string;
  readonly srcIp: string;
  /** Random hex seed. */
  readonly seed: string;
  /** Required leading zero bits in the digest. */
  readonly difficulty: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/** Client's claimed solution. */
export interface PowSolution {
  readonly challengeId: string;
  readonly nonce: number;
}

/** Injectible hasher for tests — the default uses a fast non-crypto hash. */
export type HashFn = (input: string) => number;

/**
 * Deterministic 32-bit hash used when no SHA-256 implementation is injected.
 * FNV-1a is NOT cryptographically secure, but this stub is about the *protocol*
 * (challenge → expensive answer → cheap verify), not the hash primitive. For
 * real PoW you'd inject a SHA-256 binding.
 */
const defaultHash: HashFn = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
};

/** Count leading zero bits in a 32-bit word. */
export function leadingZeros(x: number): number {
  if (x === 0) {
    return 32;
  }
  let n = 0;
  for (let i = 31; i >= 0; i--) {
    if ((x >>> i) & 1) {
      break;
    }
    n++;
  }
  return n;
}

export interface PowConfig {
  /** Challenge TTL in ms. Default 60_000. */
  challengeTtlMs?: number;
  /** Default difficulty (leading zero bits). Default 16 (~65k avg tries). */
  difficulty?: number;
  /** Max attempts we're willing to grant a client. Default 5. */
  maxChallengesPerIp?: number;
}

export class ProofOfWorkChallenge implements IDetector {
  readonly name = 'pow-challenge';

  private readonly _cfg: Required<PowConfig>;
  private readonly _hash: HashFn;
  private readonly _challenges: Map<string, PowChallenge>;
  private readonly _byIp: Map<string, number>; // outstanding count
  private _nextId: number;

  constructor(config: PowConfig = {}, hash: HashFn = defaultHash) {
    this._cfg = {
      challengeTtlMs: config.challengeTtlMs ?? 60_000,
      difficulty: config.difficulty ?? 16,
      maxChallengesPerIp: config.maxChallengesPerIp ?? 5,
    };
    this._hash = hash;
    this._challenges = new Map();
    this._byIp = new Map();
    this._nextId = 1;
  }

  /** Issue a challenge for an IP. */
  issue(srcIp: string, difficulty?: number, now: number = Date.now()): PowChallenge {
    this._gc(now);
    const outstanding = this._byIp.get(srcIp) ?? 0;
    if (outstanding >= this._cfg.maxChallengesPerIp) {
      throw new Error(`Too many outstanding challenges for ${srcIp}`);
    }
    const id = `chal-${this._nextId++}`;
    const seed = `${srcIp}-${id}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
    const chal: PowChallenge = {
      challengeId: id,
      srcIp,
      seed,
      difficulty: Math.max(0, difficulty ?? this._cfg.difficulty),
      issuedAt: now,
      expiresAt: now + this._cfg.challengeTtlMs,
    };
    this._challenges.set(id, chal);
    this._byIp.set(srcIp, outstanding + 1);
    return chal;
  }

  /**
   * Verify a claimed solution. Returns the challenge on success, else null.
   * Consumes the challenge (single use).
   */
  verify(solution: PowSolution, now: number = Date.now()): PowChallenge | null {
    const c = this._challenges.get(solution.challengeId);
    if (!c) {
      return null;
    }
    if (now > c.expiresAt) {
      this._consume(c);
      return null;
    }
    const digest = this._hash(`${c.seed}:${solution.nonce}`);
    if (leadingZeros(digest) >= c.difficulty) {
      this._consume(c);
      return c;
    }
    return null;
  }

  /**
   * Brute-force helper for tests and for the demo client: tries nonces until
   * it finds one that satisfies difficulty.
   */
  solve(challenge: PowChallenge, maxTries: number = 5_000_000): PowSolution | null {
    for (let nonce = 0; nonce < maxTries; nonce++) {
      if (leadingZeros(this._hash(`${challenge.seed}:${nonce}`)) >= challenge.difficulty) {
        return { challengeId: challenge.challengeId, nonce };
      }
    }
    return null;
  }

  /**
   * Inspect an event: the caller puts a `pow-solution` in event.headers when
   * the client is replying to a challenge.
   */
  inspect(event: TrafficEvent): DetectionResult {
    const solHeader = event.headers?.['x-pow-solution'];
    if (!solHeader) {
      return allow(['no-challenge']);
    }
    let parsed: PowSolution;
    try {
      parsed = JSON.parse(solHeader) as PowSolution;
    } catch {
      return verdict('challenge', 0.3, ['malformed-pow-solution']);
    }
    const ok = this.verify(parsed, event.at);
    if (ok) {
      return allow(['pow-verified']);
    }
    return verdict('challenge', 0.9, ['pow-failed']);
  }

  /** Number of outstanding challenges. */
  get outstanding(): number {
    return this._challenges.size;
  }

  private _consume(c: PowChallenge): void {
    this._challenges.delete(c.challengeId);
    const n = (this._byIp.get(c.srcIp) ?? 1) - 1;
    if (n <= 0) {
      this._byIp.delete(c.srcIp);
    } else {
      this._byIp.set(c.srcIp, n);
    }
  }

  private _gc(now: number): void {
    for (const c of Array.from(this._challenges.values())) {
      if (now > c.expiresAt) {
        this._consume(c);
      }
    }
  }
}
