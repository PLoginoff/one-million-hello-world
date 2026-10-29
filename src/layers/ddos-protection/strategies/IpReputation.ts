/**
 * IpReputation
 *
 * Persistent per-source reputation: each source starts at score 0 (neutral)
 * and accumulates positive points for bad behavior (failed auth, 404 flood,
 * known-bad list hit) and negative points for good behavior (successful
 * requests, challenge passes).
 *
 * Score bands:
 *   score >= blockThreshold   → 'block'
 *   score >= challengeThreshold → 'challenge'
 *   else                      → 'allow'
 *
 * Scores decay toward 0 over time (half-life, e.g. 1 hour) so a transient
 * mistake doesn't permanently black-hole a client — the classic RBL
 * "rehabilitation" behavior.
 *
 * O(1) per event, O(sources) per tick.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

export interface IpReputationConfig {
  /** Score ≥ this → block. Default 100. */
  blockThreshold?: number;
  /** Score ≥ this → challenge. Default 40. */
  challengeThreshold?: number;
  /** Half-life in ms for score decay toward 0. Default 3_600_000 (1h). */
  halfLifeMs?: number;
  /** Score added on a "bad" signal. Default 10. */
  badEventCost?: number;
  /** Score subtracted on a "good" signal. Default 1. */
  goodEventCredit?: number;
}

interface ReputationEntry {
  score: number;
  lastUpdatedAt: number;
  badEvents: number;
  goodEvents: number;
}

export class IpReputation implements IDetector {
  readonly name = 'ip-reputation';

  private readonly _cfg: Required<IpReputationConfig>;
  private readonly _entries: Map<string, ReputationEntry>;
  private readonly _staticBlocklist: Set<string>;
  private readonly _staticAllowlist: Set<string>;

  constructor(config: IpReputationConfig = {}) {
    this._cfg = {
      blockThreshold: config.blockThreshold ?? 100,
      challengeThreshold: config.challengeThreshold ?? 40,
      halfLifeMs: config.halfLifeMs ?? 3_600_000,
      badEventCost: config.badEventCost ?? 10,
      goodEventCredit: config.goodEventCredit ?? 1,
    };
    this._entries = new Map();
    this._staticBlocklist = new Set();
    this._staticAllowlist = new Set();
  }

  /** Permanently block an IP (like an RBL listing). */
  blocklist(ip: string): void {
    this._staticBlocklist.add(ip);
  }

  /** Permanently trust an IP. */
  allowlist(ip: string): void {
    this._staticAllowlist.add(ip);
    this._entries.delete(ip);
  }

  /** Signal: "this IP did something bad". */
  recordBad(ip: string, weight: number = 1, now: number = Date.now()): void {
    if (this._staticAllowlist.has(ip)) {
      return;
    }
    const e = this._entryFor(ip, now);
    e.score += this._cfg.badEventCost * weight;
    e.badEvents += 1;
    e.lastUpdatedAt = now;
  }

  /** Signal: "this IP did something good". */
  recordGood(ip: string, weight: number = 1, now: number = Date.now()): void {
    const e = this._entryFor(ip, now);
    e.score = Math.max(0, e.score - this._cfg.goodEventCredit * weight);
    e.goodEvents += 1;
    e.lastUpdatedAt = now;
  }

  /** Inspect an event — contributes nothing new, just reads state. */
  inspect(event: TrafficEvent): DetectionResult {
    if (this._staticAllowlist.has(event.srcIp)) {
      return allow(['allowlisted']);
    }
    if (this._staticBlocklist.has(event.srcIp)) {
      return verdict('block', 1, ['static-blocklist']);
    }
    const e = this._entries.get(event.srcIp);
    if (!e) {
      return allow(['no-history']);
    }
    this._decay(e, event.at);
    if (e.score >= this._cfg.blockThreshold) {
      return verdict('block', 1, [`score:${e.score.toFixed(1)}>=block`], {
        score: e.score,
      });
    }
    if (e.score >= this._cfg.challengeThreshold) {
      return verdict('challenge', e.score / this._cfg.blockThreshold, [
        `score:${e.score.toFixed(1)}>=challenge`,
      ]);
    }
    return allow([`score:${e.score.toFixed(1)}`]);
  }

  /** Current (decayed) score for an IP. */
  score(ip: string, now: number = Date.now()): number {
    const e = this._entries.get(ip);
    if (!e) {
      return 0;
    }
    this._decay(e, now);
    return e.score;
  }

  /** Apply half-life decay to all entries (admin/test). */
  tick(now: number = Date.now()): void {
    for (const e of this._entries.values()) {
      this._decay(e, now);
    }
  }

  reset(): void {
    this._entries.clear();
  }

  /**
   * Exponential decay toward 0:
   *     score(t) = score(t0) * 2^(-(t-t0)/halfLife)
   */
  private _decay(e: ReputationEntry, now: number): void {
    if (now <= e.lastUpdatedAt) {
      return;
    }
    const halfLives = (now - e.lastUpdatedAt) / this._cfg.halfLifeMs;
    e.score *= Math.pow(0.5, halfLives);
    if (e.score < 0.01) {
      e.score = 0;
    }
    e.lastUpdatedAt = now;
  }

  private _entryFor(ip: string, now: number): ReputationEntry {
    let e = this._entries.get(ip);
    if (!e) {
      e = { score: 0, lastUpdatedAt: now, badEvents: 0, goodEvents: 0 };
      this._entries.set(ip, e);
    }
    return e;
  }
}
