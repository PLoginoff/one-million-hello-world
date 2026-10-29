/**
 * DDoS Protection Types
 *
 * Shared traffic/attack model used by all detection strategies.
 *
 * @module DdosProtectionLayer/Types
 */

/** A normalized view of one inbound connection/request. */
export interface TrafficEvent {
  /** Client IP (as seen by the edge). */
  readonly srcIp: string;
  /** Client port (for SYN tracking). */
  readonly srcPort?: number;
  /** Target host/path/service. */
  readonly target?: string;
  /** HTTP method or protocol (`GET`, `TCP-SYN`, `UDP`). */
  readonly protocol: string;
  /** Unix ms timestamp of arrival. */
  readonly at: number;
  /** Size of the request (bytes) if known. */
  readonly bytes?: number;
  /** Optional arbitrary headers for header-aware detectors. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** TCP connection lifecycle state. */
export type TcpConnState = 'syn-received' | 'established' | 'closed' | 'reset';

/** Verdict returned by detectors. */
export type Verdict = 'allow' | 'challenge' | 'rate-limit' | 'block';

/** Aggregated detection output. */
export interface DetectionResult {
  readonly verdict: Verdict;
  /** 0..1 confidence that this is malicious. */
  readonly score: number;
  /** Human/machine-readable reasons contributing to the verdict. */
  readonly reasons: string[];
  /** Sub-scores by detector name (for debugging). */
  readonly breakdown: Readonly<Record<string, number>>;
}

/**
 * Contract for a detector that inspects a single event.
 * Detectors are push-based: the layer calls {@link inspect} per event; the
 * detector updates its internal state and returns a partial verdict.
 */
export interface IDetector {
  readonly name: string;
  inspect(event: TrafficEvent): DetectionResult;
  /** Periodic maintenance (window pruning, decay). */
  tick?(now: number): void;
  /** Reset detector state (admin/tests). */
  reset?(): void;
}

/** Compose an allow verdict. */
export function allow(reasons: string[] = []): DetectionResult {
  return { verdict: 'allow', score: 0, reasons, breakdown: {} };
}

/** Compose a verdict with score and breakdown. */
export function verdict(
  v: Verdict,
  score: number,
  reasons: string[],
  breakdown: Record<string, number> = {}
): DetectionResult {
  return {
    verdict: v,
    score: Math.max(0, Math.min(1, score)),
    reasons,
    breakdown: Object.freeze({ ...breakdown }),
  };
}

/** Merge multiple detector results: highest severity wins, scores add. */
export function mergeResults(results: DetectionResult[]): DetectionResult {
  const order: Record<Verdict, number> = { allow: 0, challenge: 1, 'rate-limit': 2, block: 3 };
  let worst: Verdict = 'allow';
  let score = 0;
  const reasons: string[] = [];
  const breakdown: Record<string, number> = {};
  for (const r of results) {
    if (order[r.verdict] > order[worst]) {
      worst = r.verdict;
    }
    score = Math.max(score, r.score);
    reasons.push(...r.reasons);
    for (const [k, v] of Object.entries(r.breakdown)) {
      breakdown[k] = v;
    }
  }
  return {
    verdict: worst,
    score: Math.max(0, Math.min(1, score)),
    reasons,
    breakdown: Object.freeze(breakdown),
  };
}
