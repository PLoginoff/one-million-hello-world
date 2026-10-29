/**
 * Rules
 *
 * Concrete fraud rules: velocity checks, amount anomaly vs user history,
 * impossible-travel geography, device fingerprint signals, blocklist and
 * amount-threshold rules.
 */

import {
  IFraudRule,
  FraudRuleContext,
  RiskSignal,
  Transaction,
  GeoLocation,
} from './Types';

function signal(
  name: string,
  weight: number,
  score: number,
  severity: number,
  triggered: boolean,
  explanation: string
): RiskSignal {
  return { name, weight, score, severity, triggered, explanation };
}

/** Great-circle distance in km (haversine). */
export function haversineKm(a: GeoLocation, b: GeoLocation): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Velocity rule: more than `maxCount` transactions in the trailing
 * `windowMs` window is anomalous.
 */
export class VelocityRule implements IFraudRule {
  readonly name = 'velocity';
  readonly weight: number;
  private readonly windowMs: number;
  private readonly maxCount: number;

  constructor(windowMs: number, maxCount: number, weight = 20) {
    this.windowMs = windowMs;
    this.maxCount = maxCount;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (profile === undefined) {
      return signal(this.name, this.weight, 0, 0, false, 'no user history');
    }
    const cutoff = transaction.timestamp - this.windowMs;
    const count = profile.priorTransactions.filter(
      (t) => t.timestamp >= cutoff && t.timestamp <= transaction.timestamp
    ).length;
    const ratio = count / this.maxCount;
    const triggered = count > this.maxCount;
    const severity = Math.min(1, Math.max(0, ratio - 1));
    return signal(
      this.name,
      this.weight,
      triggered ? 100 * severity : Math.max(0, ratio - 0.7) * 30,
      severity,
      triggered,
      `${count} txns in ${this.windowMs / 1000}s window (max ${this.maxCount})`
    );
  }
}

/**
 * Amount anomaly: z-score of the transaction amount vs the user's
 * historical amount distribution.
 */
export class AmountAnomalyRule implements IFraudRule {
  readonly name = 'amount-anomaly';
  readonly weight: number;
  private readonly zThreshold: number;
  private readonly minHistory: number;

  constructor(zThreshold = 3, minHistory = 5, weight = 25) {
    this.zThreshold = zThreshold;
    this.minHistory = minHistory;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (profile === undefined || profile.priorTransactions.length < this.minHistory) {
      return signal(this.name, this.weight, 0, 0, false, 'insufficient history');
    }
    const amounts = profile.priorTransactions.map((t) => t.amount);
    const m = mean(amounts);
    const s = stddev(amounts);
    if (s === 0) {
      const triggered = transaction.amount > m * 2;
      return signal(
        this.name,
        this.weight,
        triggered ? 70 : 0,
        triggered ? 0.7 : 0,
        triggered,
        `amount ${transaction.amount} vs constant history ${m}`
      );
    }
    const z = (transaction.amount - m) / s;
    const triggered = z > this.zThreshold;
    const severity = Math.min(1, Math.max(0, (z - this.zThreshold) / this.zThreshold));
    return signal(
      this.name,
      this.weight,
      triggered ? Math.min(100, z * 15) : Math.max(0, z) * 10,
      severity,
      triggered,
      `amount z-score ${z.toFixed(2)} (mean=${m.toFixed(2)}, sd=${s.toFixed(2)})`
    );
  }
}

/**
 * Impossible travel: if the user's most recent prior transaction with a
 * location implies travel faster than `maxSpeedKmh`, flag it.
 */
export class ImpossibleTravelRule implements IFraudRule {
  readonly name = 'impossible-travel';
  readonly weight: number;
  private readonly maxSpeedKmh: number;

  constructor(maxSpeedKmh = 900, weight = 35) {
    this.maxSpeedKmh = maxSpeedKmh;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (transaction.location === undefined || profile === undefined) {
      return signal(this.name, this.weight, 0, 0, false, 'missing location');
    }
    // most recent prior txn with a location
    const prior = profile.priorTransactions
      .filter((t) => t.location !== undefined && t.timestamp < transaction.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (prior === undefined || prior.location === undefined) {
      return signal(this.name, this.weight, 0, 0, false, 'no prior location');
    }
    const dist = haversineKm(prior.location, transaction.location);
    const elapsedH = (transaction.timestamp - prior.timestamp) / 3_600_000;
    if (elapsedH <= 0) {
      return signal(this.name, this.weight, 0, 0, false, 'non-positive elapsed time');
    }
    const speed = dist / elapsedH;
    const triggered = speed > this.maxSpeedKmh;
    const severity = Math.min(1, speed / (this.maxSpeedKmh * 3));
    return signal(
      this.name,
      this.weight,
      triggered ? Math.min(100, 50 + severity * 50) : 0,
      severity,
      triggered,
      `implied speed ${speed.toFixed(0)} km/h over ${dist.toFixed(0)} km in ${(elapsedH * 60).toFixed(0)} min`
    );
  }
}

/** Unrecognized device = risk signal. */
export class NewDeviceRule implements IFraudRule {
  readonly name = 'new-device';
  readonly weight: number;

  constructor(weight = 15) {
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (transaction.deviceId === undefined) {
      return signal(this.name, this.weight, 20, 0.2, true, 'no device fingerprint');
    }
    if (profile === undefined || profile.knownDevices === undefined) {
      return signal(this.name, this.weight, 0, 0, false, 'no device history');
    }
    const known = profile.knownDevices.has(transaction.deviceId);
    return signal(
      this.name,
      this.weight,
      known ? 0 : 60,
      known ? 0 : 0.6,
      !known,
      known ? 'recognized device' : `unrecognized device ${transaction.deviceId}`
    );
  }
}

/** Transaction occurs at unusual hour for the user (card-not-present). */
export class UnusualHourRule implements IFraudRule {
  readonly name = 'unusual-hour';
  readonly weight: number;
  private readonly nightStart: number;
  private readonly nightEnd: number;

  constructor(nightStartHour = 1, nightEndHour = 5, weight = 10) {
    this.nightStart = nightStartHour;
    this.nightEnd = nightEndHour;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction } = context;
    const hour = new Date(transaction.timestamp).getUTCHours();
    const isNight = hour >= this.nightStart && hour < this.nightEnd;
    const online = transaction.channel === 'online' || transaction.channel === 'atm';
    const triggered = isNight && online;
    return signal(
      this.name,
      this.weight,
      triggered ? 40 : 0,
      triggered ? 0.4 : 0,
      triggered,
      triggered ? `online txn at ${hour}:00 UTC` : 'normal hours'
    );
  }
}

/** Absolute amount ceiling — a hard sanity rule. */
export class AmountCeilingRule implements IFraudRule {
  readonly name = 'amount-ceiling';
  readonly weight: number;
  private readonly ceiling: number;

  constructor(ceiling: number, weight = 15) {
    this.ceiling = ceiling;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction } = context;
    const triggered = transaction.amount > this.ceiling;
    const ratio = transaction.amount / this.ceiling;
    return signal(
      this.name,
      this.weight,
      triggered ? Math.min(100, 40 + ratio * 10) : 0,
      Math.min(1, Math.max(0, ratio - 1)),
      triggered,
      `amount ${transaction.amount} vs ceiling ${this.ceiling}`
    );
  }
}

/** Geographic distance from home centroid beyond a radius. */
export class AwayFromHomeRule implements IFraudRule {
  readonly name = 'away-from-home';
  readonly weight: number;
  private readonly radiusKm: number;

  constructor(radiusKm = 500, weight = 15) {
    this.radiusKm = radiusKm;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction, profile } = context;
    if (
      transaction.location === undefined ||
      profile === undefined ||
      profile.homeLocation === undefined
    ) {
      return signal(this.name, this.weight, 0, 0, false, 'missing location data');
    }
    const dist = haversineKm(profile.homeLocation, transaction.location);
    const triggered = dist > this.radiusKm;
    const severity = Math.min(1, dist / (this.radiusKm * 4));
    return signal(
      this.name,
      this.weight,
      triggered ? 30 + severity * 40 : 0,
      severity,
      triggered,
      `${dist.toFixed(0)} km from home (radius ${this.radiusKm} km)`
    );
  }
}

/** Merchant-category in a configurable high-risk set. */
export class HighRiskMerchantRule implements IFraudRule {
  readonly name = 'high-risk-merchant';
  readonly weight: number;
  private readonly categories: ReadonlySet<string>;

  constructor(categories: readonly string[], weight = 20) {
    this.categories = new Set(categories);
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const { transaction } = context;
    const cat = transaction.merchantCategory;
    const triggered = cat !== undefined && this.categories.has(cat);
    return signal(
      this.name,
      this.weight,
      triggered ? 50 : 0,
      triggered ? 0.5 : 0,
      triggered,
      triggered ? `high-risk category '${cat}'` : 'normal category'
    );
  }
}

export function isTransaction(value: unknown): value is Transaction {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.amount === 'number' &&
    typeof v.timestamp === 'number'
  );
}
