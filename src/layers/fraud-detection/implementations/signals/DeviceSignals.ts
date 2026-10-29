/**
 * DeviceSignals
 *
 * Device fingerprinting and behavioral signals: fingerprint similarity
 * (partial-match scoring for spoofed/emulated devices), IP analysis
 * (subnet churn, datacenter heuristics), and session-behavior signals.
 */

import { Transaction, UserProfile, IFraudRule, FraudRuleContext, RiskSignal } from '../fraud/Types';

export interface DeviceFingerprint {
  readonly deviceId: string;
  readonly userAgent?: string;
  readonly screenResolution?: string;
  readonly timezone?: string;
  readonly language?: string;
  readonly platform?: string;
  readonly ipAddress?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Similarity between two fingerprints: weighted field equality +
 * attribute Jaccard. In [0,1]; lower = more different (more suspicious
 * when the deviceId claims to be the same).
 */
export function fingerprintSimilarity(a: DeviceFingerprint, b: DeviceFingerprint): number {
  const weights: Array<[keyof DeviceFingerprint, number]> = [
    ['userAgent', 0.25],
    ['screenResolution', 0.15],
    ['timezone', 0.15],
    ['language', 0.1],
    ['platform', 0.2],
  ];
  let score = 0;
  let total = 0;
  for (const [field, w] of weights) {
    const av = a[field];
    const bv = b[field];
    if (typeof av === 'string' && typeof bv === 'string') {
      total += w;
      if (av === bv) score += w;
    }
  }
  if (a.attributes !== undefined && b.attributes !== undefined) {
    const keys = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
    if (keys.size > 0) {
      let inter = 0;
      for (const k of keys) {
        if (a.attributes[k] === b.attributes[k]) inter++;
      }
      score += 0.15 * (inter / keys.size);
      total += 0.15;
    }
  }
  return total > 0 ? score / total : 0;
}

/** Extract the /24 subnet prefix of an IPv4 address. */
export function subnet24(ip: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (m === null) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** Well-known public/relay IP prefixes (simplified stand-in for a real feed). */
const DATACENTER_PREFIXES = new Set([
  '10.', // private — reused in NATs
  '34.', '35.', '52.', '54.', // common cloud ranges
]);

export function isDatacenterIp(ip: string): boolean {
  for (const p of DATACENTER_PREFIXES) {
    if (ip.startsWith(p)) return true;
  }
  return false;
}

/**
 * Rule: same deviceId seen under a different fingerprint = possible
 * spoofing. Requires a profile whose prior transactions carry device
 * fingerprint metadata.
 */
export class DeviceSpoofRule implements IFraudRule {
  readonly name = 'device-spoof';
  readonly weight: number;
  private readonly minSimilarity: number;

  constructor(minSimilarity = 0.5, weight = 30) {
    this.minSimilarity = minSimilarity;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    const meta = transaction.metadata;
    if (meta === undefined || transaction.deviceId === undefined || profile === undefined) {
      return inactive(this.weight);
    }
    const current = fingerprintFrom(meta, transaction.deviceId);
    if (current === null) return inactive(this.weight);
    // find the most recent prior txn from the same deviceId
    for (const prior of [...profile.priorTransactions].reverse()) {
      if (prior.deviceId !== transaction.deviceId || prior.metadata === undefined) {
        continue;
      }
      const prev = fingerprintFrom(prior.metadata, prior.deviceId);
      if (prev === null) continue;
      const sim = fingerprintSimilarity(current, prev);
      const triggered = sim < this.minSimilarity;
      return {
        name: this.name,
        weight: this.weight,
        score: triggered ? 50 + (1 - sim) * 50 : (1 - sim) * 20,
        severity: 1 - sim,
        triggered,
        explanation: `device fingerprint similarity ${sim.toFixed(2)}`,
      };
    }
    return inactive(this.weight);
  }
}

function fingerprintFrom(
  meta: Readonly<Record<string, unknown>>,
  deviceId: string
): DeviceFingerprint | null {
  const fp = meta['fingerprint'];
  if (typeof fp !== 'object' || fp === null) return null;
  const r = fp as Record<string, unknown>;
  return {
    deviceId,
    userAgent: typeof r.userAgent === 'string' ? r.userAgent : undefined,
    screenResolution: typeof r.screenResolution === 'string' ? r.screenResolution : undefined,
    timezone: typeof r.timezone === 'string' ? r.timezone : undefined,
    language: typeof r.language === 'string' ? r.language : undefined,
    platform: typeof r.platform === 'string' ? r.platform : undefined,
  };
}

function inactive(weight: number): RiskSignal {
  return {
    name: 'inactive',
    weight,
    score: 0,
    severity: 0,
    triggered: false,
    explanation: 'insufficient data',
  };
}

/** Rule: IP hopping — many distinct /24 subnets in recent history. */
export class IpChurnRule implements IFraudRule {
  readonly name = 'ip-churn';
  readonly weight: number;
  private readonly windowMs: number;
  private readonly maxDistinct: number;

  constructor(windowMs: number, maxDistinct: number, weight = 20) {
    this.windowMs = windowMs;
    this.maxDistinct = maxDistinct;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (profile === undefined) {
      return { ...inactive(this.weight), name: this.name };
    }
    const cutoff = transaction.timestamp - this.windowMs;
    const subnets = new Set<string>();
    for (const t of profile.priorTransactions) {
      if (t.timestamp < cutoff || t.ipAddress === undefined) continue;
      const sub = subnet24(t.ipAddress);
      if (sub !== null) subnets.add(sub);
    }
    if (transaction.ipAddress !== undefined) {
      const sub = subnet24(transaction.ipAddress);
      if (sub !== null) subnets.add(sub);
    }
    const triggered = subnets.size > this.maxDistinct;
    return {
      name: this.name,
      weight: this.weight,
      score: triggered ? Math.min(100, subnets.size * 15) : 0,
      severity: Math.min(1, subnets.size / (this.maxDistinct * 3)),
      triggered,
      explanation: `${subnets.size} distinct /24 subnets in window (max ${this.maxDistinct})`,
    };
  }
}

/** Rule: datacenter IP. */
export class DatacenterIpRule implements IFraudRule {
  readonly name = 'datacenter-ip';
  readonly weight: number;

  constructor(weight = 15) {
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction } = context;
    const ip = transaction.ipAddress;
    const triggered = ip !== undefined && isDatacenterIp(ip);
    return {
      name: this.name,
      weight: this.weight,
      score: triggered ? 40 : 0,
      severity: triggered ? 0.4 : 0,
      triggered,
      explanation: triggered ? `datacenter ip ${ip}` : 'residential ip',
    };
  }
}

/**
 * Behavioral cadence rule: transaction intervals that are too regular
 * (bot-like) or too fast.
 */
export class CadenceRule implements IFraudRule {
  readonly name = 'cadence';
  readonly weight: number;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 2_000, weight = 15) {
    this.minIntervalMs = minIntervalMs;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (profile === undefined || profile.priorTransactions.length < 2) {
      return { ...inactive(this.weight), name: this.name };
    }
    const times = [...profile.priorTransactions, transaction]
      .map((t) => t.timestamp)
      .sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
    const fast = intervals.filter((i) => i < this.minIntervalMs).length;
    // regularity: coefficient of variation of intervals
    const m = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const sd = Math.sqrt(
      intervals.reduce((s, v) => s + (v - m) ** 2, 0) / intervals.length
    );
    const cv = m > 0 ? sd / m : 1;
    const botLike = intervals.length >= 4 && cv < 0.15 && m < 60_000;
    const triggered = fast > 0 || botLike;
    return {
      name: this.name,
      weight: this.weight,
      score: triggered ? Math.min(100, fast * 30 + (botLike ? 40 : 0)) : 0,
      severity: Math.min(1, fast / 3 + (botLike ? 0.5 : 0)),
      triggered,
      explanation: `${fast} sub-${this.minIntervalMs}ms intervals, interval CV=${cv.toFixed(2)}`,
    };
  }
}
