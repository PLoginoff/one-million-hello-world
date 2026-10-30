/**
 * Bot-Detection Engine — shared types.
 *
 * Vocabulary:
 * - `BiometricAnalyzer`   — keystroke-timing entropy + mouse-path
 *                            linearity behavioral biometrics.
 * - `FingerprintRegistry` — per-user device-fingerprint drift
 *                            detection.
 * - `EscalationPolicy`    — score → challenge-level mapping.
 * - `BotnetDetector`      — correlated-request botnet detection
 *                            across IPs sharing a fingerprint.
 *
 * @module BotDetectionLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface BotClock {
  now(): number;
}

export class SystemBotClock implements BotClock {
  now(): number {
    return Date.now();
  }
}

export class ManualBotClock implements BotClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Behavioral biometrics                                               */
/* ------------------------------------------------------------------ */

/** One keystroke: key down/up pair. */
export interface Keystroke {
  /** key code (opaque label). */
  readonly key: string;
  /** ms the key was held. */
  readonly dwellMs: number;
  /** ms from previous key's release to this press. */
  readonly flightMs: number;
}

/** One mouse-path sample. */
export interface MousePoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BiometricFeatures {
  /** Shannon entropy of dwell-time distribution, bits. */
  readonly dwellEntropy: number;
  /** coefficient of variation of flight times. */
  readonly flightCv: number;
  /** 0..1: how straight the path is vs its bounding diagonal. */
  readonly linearity: number;
  /** coefficient of variation of per-segment speeds. */
  readonly speedCv: number;
  /** samples analyzed. */
  readonly samples: number;
}

export interface BiometricAssessment {
  /** 0..1 bot-likelihood. */
  readonly score: number;
  readonly reasons: readonly string[];
  readonly features: BiometricFeatures;
}

/* ------------------------------------------------------------------ */
/* Fingerprint stability                                               */
/* ------------------------------------------------------------------ */

/** A device fingerprint snapshot. */
export interface Fingerprint {
  /** component name → component value (canvas hash, ua, tz, ...). */
  readonly components: Readonly<Record<string, string>>;
  /** when observed. */
  readonly at: number;
}

export interface DriftAssessment {
  /** 0..1 suspicion from fingerprint drift. */
  readonly score: number;
  /** components that changed since the established fingerprint. */
  readonly changed: readonly string[];
  /** observations recorded for this user. */
  readonly observations: number;
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

/** Challenge levels ordered by friction. */
export type ChallengeLevel =
  | 'pass'
  | 'silent-cookie'
  | 'captcha-checkbox'
  | 'captcha-puzzle'
  | 'js-challenge'
  | 'block';

export interface EscalationDecision {
  readonly level: ChallengeLevel;
  /** the score that produced this decision. */
  readonly score: number;
  /** why: which band matched. */
  readonly band: string;
  /** consecutive escalations already applied to this subject. */
  readonly escalationCount: number;
}

/* ------------------------------------------------------------------ */
/* Botnet                                                              */
/* ------------------------------------------------------------------ */

export interface CorrelatedCluster {
  /** fingerprint value shared by the cluster. */
  readonly fingerprint: string;
  /** distinct IPs observed with it. */
  readonly ips: readonly string[];
  /** requests in the correlation window. */
  readonly requests: number;
  /** 0..1 botnet-likelihood. */
  readonly score: number;
}
