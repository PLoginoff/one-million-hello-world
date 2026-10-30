/**
 * Attack Classifier
 *
 * Assigns an observed traffic window to the standard DDoS taxonomy —
 * volumetric, protocol, or application — using weighted signature
 * matching rather than a single threshold.
 *
 * Method — soft signature scoring:
 *
 *   Each signature (e.g. "syn-flood", "udp-amplification", "http-flood",
 *   "slowloris") is a set of evidence predicates, each contributing a
 *   weight. Evidence comes from window aggregates (see {@link AttackEvidence}):
 *   SYN ratio, established-conn ratio, bytes/request, requests/IP, L7
 *   share, etc. A signature's score is the fraction of its weight that
 *   fired, normalised to 0..1. The best-scoring signature wins when its
 *   score clears `minConfidence`; otherwise the class is `unknown`.
 *
 *   Why weighted signatures instead of hard rules: real attacks are
 *   hybrid (e.g. SYN flood + HTTP flood). Signature scores expose the
 *   mixture via `signatureScores` so the playbook can still pick the
 *   dominant vector while operators see the blend.
 *
 * Complexity: O(S·P) where S = signatures, P = predicates per signature
 * (both small constants — sub-µs per window).
 *
 * @module DdosProtectionLayer/Engine2
 */

import {
  AttackClass,
  AttackEvidence,
  ClassificationResult,
  TrafficSample,
} from './types';

/** One predicate in a signature: reads evidence, returns true when it fires. */
interface Predicate {
  readonly describe: string;
  readonly weight: number;
  readonly test: (e: AttackEvidence) => boolean;
}

interface Signature {
  readonly name: string;
  readonly attackClass: AttackClass;
  readonly predicates: readonly Predicate[];
  readonly totalWeight: number;
}

function sig(name: string, attackClass: AttackClass, predicates: Predicate[]): Signature {
  return {
    name,
    attackClass,
    predicates,
    totalWeight: predicates.reduce((a, p) => a + p.weight, 0),
  };
}

function p(describe: string, weight: number, test: (e: AttackEvidence) => boolean): Predicate {
  return { describe, weight, test };
}

/* ------------------------------------------------------------------ */
/* Built-in signatures                                                 */
/* ------------------------------------------------------------------ */

/**
 * Signature rationale (each reflects the canonical fingerprint):
 *
 *  - syn-flood: huge SYN share + almost no established conns + tiny
 *    payloads — the attacker never completes handshakes.
 *  - udp-amplification: massive bytes/sec with large avg payload and low
 *    L7 share — reflected UDP (DNS/NTP/memcached) is fat and stateless.
 *  - http-flood: high req/s, high L7 share, distributed across many IPs
 *    (low requests/IP), few distinct targets — botnet GET/POST floods.
 *  - slowloris: low req/s but very low established ratio & error-free
 *    slow dribble — connections held open rather than flooded.
 *  - conn-exhaustion: high req/s concentrated from few IPs (high
 *    requests/IP) with moderate L7 share — single-source hammering.
 */
const SIGNATURES: readonly Signature[] = [
  sig('syn-flood', AttackClass.Protocol, [
    p('syn ratio > 0.7', 3, (e) => e.synRatio > 0.7),
    p('established ratio < 0.2', 3, (e) => e.establishedRatio < 0.2),
    p('bytes/request < 200', 2, (e) => e.bytesPerRequest < 200),
    p('requests/sec > 1k', 2, (e) => e.requestsPerSec > 1000),
  ]),
  sig('conn-exhaustion', AttackClass.Protocol, [
    p('requests/ip > 500', 3, (e) => e.requestsPerIp > 500),
    p('requests/sec > 500', 2, (e) => e.requestsPerSec > 500),
    p('established ratio > 0.5', 2, (e) => e.establishedRatio > 0.5),
    p('bytes/request < 1k', 1, (e) => e.bytesPerRequest < 1000),
  ]),
  sig('udp-amplification', AttackClass.Volumetric, [
    p('bytes/sec > 100MB', 4, (e) => e.bytesPerSec > 100e6),
    p('bytes/request > 500', 2, (e) => e.bytesPerRequest > 500),
    p('l7 ratio < 0.2', 2, (e) => e.l7Ratio < 0.2),
    p('syn ratio < 0.1', 2, (e) => e.synRatio < 0.1),
  ]),
  sig('bandwidth-flood', AttackClass.Volumetric, [
    p('bytes/sec > 50MB', 3, (e) => e.bytesPerSec > 50e6),
    p('requests/sec > 5k', 3, (e) => e.requestsPerSec > 5000),
    p('bytes/request < 500', 2, (e) => e.bytesPerRequest < 500),
    p('l7 ratio < 0.4', 2, (e) => e.l7Ratio < 0.4),
  ]),
  sig('http-flood', AttackClass.Application, [
    // The volume predicate carries the most weight — without it the
    // distributional predicates fire on perfectly normal traffic
    // (normal browsing is also many IPs × few requests each).
    p('requests/sec > 1k', 4, (e) => e.requestsPerSec > 1000),
    p('l7 ratio > 0.8', 3, (e) => e.l7Ratio > 0.8),
    p('requests/ip < 50 (distributed)', 2, (e) => e.requestsPerIp > 0 && e.requestsPerIp < 50),
    p('distinct targets < 10', 2, (e) => e.distinctTargets > 0 && e.distinctTargets < 10),
    p('established ratio > 0.7', 1, (e) => e.establishedRatio > 0.7),
  ]),
  sig('slowloris', AttackClass.Application, [
    p('requests/sec < 500', 2, (e) => e.requestsPerSec > 0 && e.requestsPerSec < 500),
    p('established ratio < 0.3', 3, (e) => e.establishedRatio < 0.3),
    p('bytes/request < 300', 2, (e) => e.bytesPerRequest < 300),
    p('l7 ratio > 0.5', 2, (e) => e.l7Ratio > 0.5),
    p('error ratio < 0.3', 1, (e) => e.errorRatio < 0.3),
  ]),
];

export interface AttackClassifierConfig {
  /** Minimum winning score to commit to a class. Default 0.55. */
  readonly minConfidence?: number;
}

export class AttackClassifier {
  private readonly _minConfidence: number;

  constructor(config: AttackClassifierConfig = {}) {
    this._minConfidence = config.minConfidence ?? 0.55;
  }

  /**
   * Aggregate raw samples covering one assessment window into evidence.
   * `distinctTargets` is supplied by the caller (it needs path-level
   * visibility the samples don't carry).
   */
  buildEvidence(samples: readonly TrafficSample[], windowMs: number, distinctTargets = 0): AttackEvidence {
    let requests = 0;
    let bytes = 0;
    let ips = 0;
    let syn = 0;
    let l7 = 0;
    let est = 0;
    let err = 0;
    for (const s of samples) {
      requests += s.requests;
      bytes += s.bytes;
      ips += s.uniqueIps;
      syn += s.synCount;
      l7 += s.l7Count;
      est += s.establishedCount;
      err += s.errorCount;
    }
    const secs = Math.max(0.001, windowMs / 1000);
    return {
      requestsPerSec: requests / secs,
      bytesPerSec: bytes / secs,
      bytesPerRequest: requests > 0 ? bytes / requests : 0,
      synRatio: requests > 0 ? syn / requests : 0,
      establishedRatio: requests > 0 ? est / requests : 0,
      l7Ratio: requests > 0 ? l7 / requests : 0,
      errorRatio: requests > 0 ? err / requests : 0,
      requestsPerIp: ips > 0 ? requests / ips : requests,
      distinctTargets,
    };
  }

  /**
   * Score every signature against the evidence; return the winner.
   * A tie prefers the higher raw weighted score (more absolute evidence).
   */
  classify(evidence: AttackEvidence): ClassificationResult {
    const scores = new Map<string, number>();
    const rawScores = new Map<string, number>();
    const rationaleBySig = new Map<string, string[]>();
    let best: Signature | null = null;
    let bestScore = 0;
    let bestRaw = 0;

    for (const s of SIGNATURES) {
      let fired = 0;
      const rationale: string[] = [];
      for (const pred of s.predicates) {
        if (pred.test(evidence)) {
          fired += pred.weight;
          rationale.push(pred.describe);
        }
      }
      const score = s.totalWeight > 0 ? fired / s.totalWeight : 0;
      scores.set(s.name, score);
      rawScores.set(s.name, fired);
      rationaleBySig.set(s.name, rationale);
      if (score > bestScore || (score === bestScore && fired > bestRaw)) {
        best = s;
        bestScore = score;
        bestRaw = fired;
      }
    }

    const signatureScores: Record<string, number> = {};
    for (const [k, v] of scores) signatureScores[k] = v;

    if (!best || bestScore < this._minConfidence) {
      return {
        attackClass: AttackClass.Unknown,
        confidence: bestScore,
        signatureScores,
        rationale: best ? (rationaleBySig.get(best.name) ?? []) : [],
      };
    }

    return {
      attackClass: best.attackClass,
      confidence: bestScore,
      signatureScores,
      rationale: rationaleBySig.get(best.name) ?? [],
    };
  }

  /** All registered signature names (for introspection/reporting). */
  signatures(): string[] {
    return SIGNATURES.map((s) => s.name);
  }
}
