/**
 * Engine2 shared types — adaptive DDoS defense.
 *
 * Unlike the push-based detectors in `strategies/` (per-event verdicts),
 * engine2 operates one level up: it learns a *traffic baseline*, derives
 * detection thresholds from it, classifies observed attacks into the
 * standard taxonomy (volumetric / protocol / application), and drives a
 * mitigation playbook. All engines share the types here and an
 * injectable {@link IClock} so timing behaviour is deterministic in tests.
 *
 * @module DdosProtectionLayer/Engine2
 */

/** Injectable clock — engines never call Date.now() directly. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Observation model                                                   */
/* ------------------------------------------------------------------ */

/**
 * One aggregated traffic sample for a window — produced by whatever
 * edge/collector feeds the engine. Engines work on aggregates rather than
 * raw packets so they can sit behind any telemetry source.
 */
export interface TrafficSample {
  /** Wall-clock ms this sample covers (end of window). */
  readonly at: number;
  /** Total requests/packets observed in the window. */
  readonly requests: number;
  /** Total bytes observed in the window. */
  readonly bytes: number;
  /** Distinct source IPs seen. */
  readonly uniqueIps: number;
  /** Requests that carried a TCP-SYN marker. */
  readonly synCount: number;
  /** Requests that looked like L7 (HTTP GET/POST etc.). */
  readonly l7Count: number;
  /** Requests that completed a handshake (established conns). */
  readonly establishedCount: number;
  /** Requests marked as errors/timeouts by the upstream. */
  readonly errorCount: number;
}

/** A single per-IP observation used by the risk scorer. */
export interface IpObservation {
  readonly ip: string;
  readonly at: number;
  /** Requests this IP made in the window. */
  readonly requests: number;
  /** Whether the IP was flagged by a detector this window. */
  readonly flagged: boolean;
  /** Whether the IP failed a challenge (CAPTCHA/PoW) if one was issued. */
  readonly challengeFailed?: boolean;
}

/* ------------------------------------------------------------------ */
/* Adaptive thresholds                                                 */
/* ------------------------------------------------------------------ */

/** Which baseline metric a threshold tracks. */
export type BaselineMetric = 'requests' | 'bytes' | 'uniqueIps' | 'synCount' | 'l7Count' | 'errorRate';

/** A threshold derived from the learned baseline. */
export interface AdaptiveThreshold {
  readonly metric: BaselineMetric;
  /** Baseline mean μ learned from history. */
  readonly mean: number;
  /** Baseline standard deviation σ. */
  readonly stddev: number;
  /** Absolute alert level: μ + sensitivity·σ (floored at minAbsolute). */
  readonly alertLevel: number;
  /** Samples in the baseline. */
  readonly samples: number;
  /** Whether the baseline is warm enough to be trusted. */
  readonly warm: boolean;
}

export interface ThresholdConfig {
  /** σ multiplier for the alert level. Default 4. */
  readonly sensitivity?: number;
  /** Minimum samples before the threshold is "warm". Default 12. */
  readonly minSamples?: number;
  /** Floor for alertLevel — guards against σ→0 on constant traffic. */
  readonly minAbsolute?: number;
  /** EMA weight applied to new samples (0..1). Default 0.1 — slow drift. */
  readonly learnRate?: number;
}

/* ------------------------------------------------------------------ */
/* Attack classification                                               */
/* ------------------------------------------------------------------ */

/** Standard DDoS taxonomy — OSI-layer aligned. */
export enum AttackClass {
  /** L3/L4 bandwidth exhaustion: UDP flood, amplification, ICMP flood. */
  Volumetric = 'volumetric',
  /** L4 state exhaustion: SYN flood, ACK flood, connection exhaustion. */
  Protocol = 'protocol',
  /** L7 resource exhaustion: HTTP flood, slowloris, expensive endpoints. */
  Application = 'application',
  /** Pattern matches no signature strongly enough. */
  Unknown = 'unknown',
}

/** Evidence extracted from a window of samples for classification. */
export interface AttackEvidence {
  /** Requests/sec during the window. */
  readonly requestsPerSec: number;
  /** Bytes/sec during the window. */
  readonly bytesPerSec: number;
  /** Average bytes per request — tiny payloads hint at protocol floods. */
  readonly bytesPerRequest: number;
  /** SYN ratio: synCount / requests (0..1). */
  readonly synRatio: number;
  /** Established ratio: establishedCount / requests (0..1). */
  readonly establishedRatio: number;
  /** L7 ratio: l7Count / requests (0..1). */
  readonly l7Ratio: number;
  /** Error ratio: errorCount / requests (0..1). */
  readonly errorRatio: number;
  /** Requests per unique IP — concentration vs. distribution. */
  readonly requestsPerIp: number;
  /** Distinct targets (paths) hit — L7 floods concentrate on few paths. */
  readonly distinctTargets: number;
}

export interface ClassificationResult {
  readonly attackClass: AttackClass;
  /** 0..1 confidence — best signature's match score. */
  readonly confidence: number;
  /** Per-signature match scores for debugging/reporting. */
  readonly signatureScores: Readonly<Record<string, number>>;
  /** Human-readable evidence lines that drove the classification. */
  readonly rationale: string[];
}

/* ------------------------------------------------------------------ */
/* Mitigation playbook                                                 */
/* ------------------------------------------------------------------ */

/** Escalation ladder — each rung is applied in order until the attack subsides. */
export type MitigationActionKind =
  | 'monitor'
  | 'rate-limit'
  | 'challenge'
  | 'geo-filter'
  | 'blackhole'
  | 'upstream-scrub';

export interface MitigationStep {
  readonly action: MitigationActionKind;
  /** Parameter for the action (e.g. requests/sec cap, challenge type). */
  readonly params: Readonly<Record<string, number | string>>;
  /** How long this step stays active before evaluating escalation (ms). */
  readonly dwellMs: number;
}

export interface Playbook {
  readonly name: string;
  readonly forClass: AttackClass;
  /** Ordered escalation ladder — index 0 is least aggressive. */
  readonly steps: readonly MitigationStep[];
}

export enum MitigationState {
  Idle = 'idle',
  Mitigating = 'mitigating',
  Cooldown = 'cooldown',
}

export interface MitigationStatus {
  readonly state: MitigationState;
  readonly attackClass: AttackClass;
  /** Index into the playbook's steps; -1 when idle. */
  readonly stepIndex: number;
  readonly currentAction: MitigationActionKind | 'none';
  /** When the current step activated (ms). */
  readonly stepStartedAt: number;
  /** Escalations performed during this incident. */
  readonly escalations: number;
}

/* ------------------------------------------------------------------ */
/* Traffic scoring dashboard                                           */
/* ------------------------------------------------------------------ */

/** Point-in-time risk snapshot for one source IP. */
export interface RiskScorePoint {
  readonly at: number;
  /** 0..100 risk score. */
  readonly score: number;
  /** Components that produced the score (volume, flagging, challenge). */
  readonly components: Readonly<Record<string, number>>;
}

/** Dashboard row: current risk for one IP plus recent history. */
export interface IpRiskRow {
  readonly ip: string;
  readonly currentScore: number;
  readonly trend: 'rising' | 'falling' | 'stable';
  readonly history: readonly RiskScorePoint[];
  /** Total windows where the IP was flagged. */
  readonly flaggedWindows: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

export interface DashboardSnapshot {
  readonly generatedAt: number;
  /** Top-N rows by current score. */
  readonly topIps: readonly IpRiskRow[];
  /** Count of IPs above the supplied risk cutoff. */
  readonly highRiskCount: number;
  /** Mean score across all tracked IPs. */
  readonly meanScore: number;
}
