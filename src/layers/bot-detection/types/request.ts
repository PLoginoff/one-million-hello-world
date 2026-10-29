/**
 * Bot Detection Types
 *
 * Shared request model + signal aggregator contract.
 *
 * @module BotDetectionLayer/Types
 */

/** Inbound request snapshot passed to signals. */
export interface BotSignalInput {
  readonly clientIp: string;
  readonly userAgent?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly path?: string;
  readonly method?: string;
  /** Current event timestamp. */
  readonly at: number;
  /** Client-supplied fingerprint bits (TLS, canvas, webgl) if already collected. */
  readonly fingerprint?: Readonly<Record<string, string>>;
  /** Honeypot field values from the form (if any). */
  readonly honeypotFields?: Readonly<Record<string, string>>;
}

/** Per-signal evaluation outcome. */
export interface SignalResult {
  /** Stable signal id, e.g. `ua-known-bot`. */
  readonly signal: string;
  /** 0..1 contribution to bot-likelihood (0 = human-looking). */
  readonly score: number;
  /** Confidence in the score (0..1); aggregator discounts low-confidence signals. */
  readonly confidence: number;
  /** Human-readable reason. */
  readonly reason: string;
}

/** A pluggable detection signal. */
export interface IBotSignal {
  readonly name: string;
  /** Base weight in the weighted aggregate (default 1). */
  readonly weight: number;
  evaluate(input: BotSignalInput): SignalResult;
  /** Periodic state maintenance. */
  tick?(now: number): void;
}

/** Aggregated bot-detection verdict. */
export interface BotVerdict {
  /** 0..1 aggregate score (Σ weight·score·confidence / Σ weight). */
  readonly score: number;
  /** Classification. */
  readonly classification: 'human' | 'likely-human' | 'suspicious' | 'bot' | 'known-bot';
  /** Individual signal contributions. */
  readonly signals: SignalResult[];
  /** Reason summary (top contributors). */
  readonly reasons: string[];
}

export function verdict(
  score: number,
  classification: BotVerdict['classification'],
  signals: SignalResult[]
): BotVerdict {
  const reasons = signals
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .map((s) => `${s.signal}:${s.reason}`);
  return { score, classification, signals, reasons };
}
