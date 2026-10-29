/**
 * SynFloodDetector
 *
 * Detects SYN-flood attacks by tracking TCP handshake state:
 *
 *   Client    Edge          Backend
 *     │  SYN  │              │
 *     ├──────►│  syn-received│  (counted as half-open)
 *     │       │ SYN+ACK      │
 *     │◄──────┤              │
 *     │  ACK  │  established │
 *     ├──────►│              │
 *
 * A SYN flood sends SYNs but never ACKs → the ratio
 * `syn-received / (established + 1)` explodes. We flag the source when:
 *  - per-source half-open count exceeds `halfOpenThreshold`, OR
 *  - global half-open count exceeds `globalHalfOpenLimit`, OR
 *  - SYN rate from a single source exceeds `synRatePerSec`
 *
 * Each half-open entry has an `expiresAt`; `tick()` reaps expired entries so
 * memory stays bounded (classic "embryonic connection timeout" behavior from
 * the kernel).
 *
 * O(1) per event (amortized), O(halfOpen) per tick.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

export interface SynFloodConfig {
  /** Half-open entries per source before flagging. Default 20. */
  halfOpenThreshold?: number;
  /** Total half-open entries before flagging any new source. Default 10_000. */
  globalHalfOpenLimit?: number;
  /** Half-open entry lifetime (ms) before reaping. Default 10_000. */
  embryonicTimeoutMs?: number;
  /** Max SYN/sec per source. Default 50. */
  synRatePerSec?: number;
  /** Window length (ms) for rate measurement. Default 1000. */
  rateWindowMs?: number;
}

interface HalfOpen {
  srcIp: string;
  key: string; // ip:port
  expiresAt: number;
}

interface SourceState {
  halfOpen: Set<string>; // connection keys
  synTimestamps: number[]; // sliding window
}

export class SynFloodDetector implements IDetector {
  readonly name = 'syn-flood';

  private readonly _cfg: Required<SynFloodConfig>;
  private readonly _sources: Map<string, SourceState>;
  private readonly _halfOpenByKey: Map<string, HalfOpen>;
  private _totalHalfOpen: number;

  constructor(config: SynFloodConfig = {}) {
    this._cfg = {
      halfOpenThreshold: config.halfOpenThreshold ?? 20,
      globalHalfOpenLimit: config.globalHalfOpenLimit ?? 10_000,
      embryonicTimeoutMs: config.embryonicTimeoutMs ?? 10_000,
      synRatePerSec: config.synRatePerSec ?? 50,
      rateWindowMs: config.rateWindowMs ?? 1000,
    };
    this._sources = new Map();
    this._halfOpenByKey = new Map();
    this._totalHalfOpen = 0;
  }

  /**
   * Inspect a traffic event. Only `TCP-SYN` / `TCP-ACK` / `TCP-RST` protocol
   * events carry meaning; everything else is `allow`.
   */
  inspect(event: TrafficEvent): DetectionResult {
    const proto = event.protocol.toUpperCase();
    if (proto === 'TCP-SYN') {
      return this._onSyn(event);
    }
    if (proto === 'TCP-ACK') {
      return this._onAck(event);
    }
    if (proto === 'TCP-RST' || proto === 'TCP-FIN') {
      return this._onClose(event);
    }
    return allow(['not-tcp']);
  }

  /** Periodic maintenance: reap embryonic connections. */
  tick(now: number = Date.now()): number {
    let reaped = 0;
    for (const [key, h] of Array.from(this._halfOpenByKey.entries())) {
      if (h.expiresAt <= now) {
        this._halfOpenByKey.delete(key);
        const src = this._sources.get(h.srcIp);
        if (src) {
          src.halfOpen.delete(key);
        }
        this._totalHalfOpen -= 1;
        reaped += 1;
      }
    }
    return reaped;
  }

  reset(): void {
    this._sources.clear();
    this._halfOpenByKey.clear();
    this._totalHalfOpen = 0;
  }

  get totalHalfOpen(): number {
    return this._totalHalfOpen;
  }

  halfOpenFor(srcIp: string): number {
    return this._sources.get(srcIp)?.halfOpen.size ?? 0;
  }

  // -------------------------------------------------------------------------

  private _onSyn(event: TrafficEvent): DetectionResult {
    const src = this._sourceFor(event.srcIp);
    const key = `${event.srcIp}:${event.srcPort ?? 0}`;

    // Record the SYN for rate limiting.
    src.synTimestamps.push(event.at);
    this._pruneRate(src, event.at);
    const rate = (src.synTimestamps.length * 1000) / this._cfg.rateWindowMs;

    // Track half-open entry.
    src.halfOpen.add(key);
    this._halfOpenByKey.set(key, {
      srcIp: event.srcIp,
      key,
      expiresAt: event.at + this._cfg.embryonicTimeoutMs,
    });
    this._totalHalfOpen += 1;

    const reasons: string[] = [];
    let score = 0;

    if (src.halfOpen.size > this._cfg.halfOpenThreshold) {
      reasons.push(`src-half-open:${src.halfOpen.size}>${this._cfg.halfOpenThreshold}`);
      score = Math.max(score, 0.8);
    }
    if (this._totalHalfOpen > this._cfg.globalHalfOpenLimit) {
      reasons.push(`global-half-open:${this._totalHalfOpen}`);
      score = Math.max(score, 0.7);
    }
    if (rate > this._cfg.synRatePerSec) {
      reasons.push(`syn-rate:${rate.toFixed(1)}>${this._cfg.synRatePerSec}/s`);
      score = Math.max(score, 0.9);
    }

    if (score > 0) {
      return verdict('block', score, reasons, {
        halfOpen: src.halfOpen.size,
        rate,
      });
    }
    return allow();
  }

  private _onAck(event: TrafficEvent): DetectionResult {
    const key = `${event.srcIp}:${event.srcPort ?? 0}`;
    const h = this._halfOpenByKey.get(key);
    if (h) {
      this._halfOpenByKey.delete(key);
      const src = this._sources.get(h.srcIp);
      if (src) {
        src.halfOpen.delete(key);
      }
      this._totalHalfOpen -= 1;
    }
    return allow(['handshake-complete']);
  }

  private _onClose(event: TrafficEvent): DetectionResult {
    return this._onAck(event);
  }

  private _sourceFor(ip: string): SourceState {
    let s = this._sources.get(ip);
    if (!s) {
      s = { halfOpen: new Set(), synTimestamps: [] };
      this._sources.set(ip, s);
    }
    return s;
  }

  private _pruneRate(src: SourceState, now: number): void {
    const cutoff = now - this._cfg.rateWindowMs;
    while (src.synTimestamps.length > 0 && src.synTimestamps[0] < cutoff) {
      src.synTimestamps.shift();
    }
  }
}
