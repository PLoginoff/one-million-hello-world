/**
 * FeatureExtractor + LogisticScorer
 *
 * Turns transactions into a fixed feature vector and scores them with a
 * logistic regression model trained by gradient descent — an ML-style
 * scoring path alongside the rule engine.
 */

import { Transaction, UserProfile } from '../fraud/Types';
import { haversineKm } from '../fraud/Rules';

export const FEATURE_NAMES = [
  'amount_log',
  'amount_z', // vs user history
  'txn_count_1h',
  'txn_count_24h',
  'sum_amount_24h',
  'distinct_merchants_24h',
  'new_device',
  'night_hour',
  'distance_from_last_km',
  'online_channel',
  'account_age_days',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export const FEATURE_COUNT = FEATURE_NAMES.length;

/** Compute the feature vector for a transaction. */
export function extractFeatures(tx: Transaction, profile?: UserProfile): number[] {
  const prior = profile?.priorTransactions ?? [];
  const hour = new Date(tx.timestamp).getUTCHours();
  const oneHourAgo = tx.timestamp - 3_600_000;
  const oneDayAgo = tx.timestamp - 86_400_000;
  const recent1h = prior.filter((t) => t.timestamp >= oneHourAgo);
  const recent24h = prior.filter((t) => t.timestamp >= oneDayAgo);
  const amounts = prior.map((t) => t.amount);
  const mean = amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : tx.amount;
  const sd =
    amounts.length > 1
      ? Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / (amounts.length - 1))
      : 1;
  let distance = 0;
  const lastLoc = [...prior].reverse().find((t) => t.location !== undefined)?.location;
  if (lastLoc !== undefined && tx.location !== undefined) {
    distance = haversineKm(lastLoc, tx.location);
  }
  const knownDevices = profile?.knownDevices ?? new Set<string>();
  const firstSeen = prior.length > 0 ? Math.min(...prior.map((t) => t.timestamp)) : tx.timestamp;
  return [
    Math.log1p(tx.amount),
    sd > 0 ? (tx.amount - mean) / sd : 0,
    recent1h.length,
    recent24h.length,
    Math.log1p(recent24h.reduce((s, t) => s + t.amount, 0)),
    new Set(recent24h.map((t) => t.merchantId).filter((m): m is string => m !== undefined)).size,
    tx.deviceId !== undefined && knownDevices.size > 0 && !knownDevices.has(tx.deviceId) ? 1 : 0,
    hour >= 1 && hour < 5 ? 1 : 0,
    Math.log1p(distance),
    tx.channel === 'online' ? 1 : 0,
    Math.max(0, (tx.timestamp - firstSeen) / 86_400_000),
  ];
}

export interface TrainingExample {
  readonly transaction: Transaction;
  readonly profile?: UserProfile;
  readonly fraud: boolean;
}

export interface LogisticOptions {
  readonly learningRate?: number;
  readonly epochs?: number;
  readonly l2?: number;
}

function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/** Logistic regression fraud scorer trained by batch gradient descent. */
export class LogisticFraudScorer {
  private weights = new Float64Array(FEATURE_COUNT);
  private bias = 0;
  private featureMean = new Float64Array(FEATURE_COUNT);
  private featureStd = new Float64Array(FEATURE_COUNT).fill(1);
  private trained = false;

  /** Train on labeled examples. Standardizes features first. */
  train(examples: readonly TrainingExample[], options: LogisticOptions = {}): void {
    const lr = options.learningRate ?? 0.1;
    const epochs = options.epochs ?? 300;
    const l2 = options.l2 ?? 0.001;
    const X = examples.map((e) => extractFeatures(e.transaction, e.profile));
    const y = examples.map((e) => (e.fraud ? 1 : 0));
    if (X.length === 0) return;
    // standardize
    const n = X.length;
    for (let f = 0; f < FEATURE_COUNT; f++) {
      let m = 0;
      for (const row of X) m += row[f];
      m /= n;
      let v = 0;
      for (const row of X) v += (row[f] - m) ** 2;
      v = Math.sqrt(v / n);
      this.featureMean[f] = m;
      this.featureStd[f] = v > 1e-8 ? v : 1;
    }
    const Xs = X.map((row) =>
      row.map((v, f) => (v - this.featureMean[f]) / this.featureStd[f])
    );
    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradW = new Float64Array(FEATURE_COUNT);
      let gradB = 0;
      for (let i = 0; i < n; i++) {
        const z = this.dotRaw(Xs[i]) + this.bias;
        const err = sigmoid(z) - y[i];
        for (let f = 0; f < FEATURE_COUNT; f++) gradW[f] += err * Xs[i][f];
        gradB += err;
      }
      for (let f = 0; f < FEATURE_COUNT; f++) {
        this.weights[f] -= lr * (gradW[f] / n + l2 * this.weights[f]);
      }
      this.bias -= lr * (gradB / n);
    }
    this.trained = true;
  }

  private dotRaw(standardized: readonly number[]): number {
    let z = 0;
    for (let f = 0; f < FEATURE_COUNT; f++) z += this.weights[f] * standardized[f];
    return z;
  }

  /** Fraud probability in (0,1). */
  score(tx: Transaction, profile?: UserProfile): number {
    const features = extractFeatures(tx, profile);
    const standardized = features.map(
      (v, f) => (v - this.featureMean[f]) / this.featureStd[f]
    );
    return sigmoid(this.dotRaw(standardized) + this.bias);
  }

  isTrained(): boolean {
    return this.trained;
  }

  /** Feature weights for explainability. */
  explain(tx: Transaction, profile?: UserProfile): Array<{ feature: FeatureName; contribution: number }> {
    const features = extractFeatures(tx, profile);
    return FEATURE_NAMES.map((name, f) => ({
      feature: name,
      contribution:
        this.weights[f] * ((features[f] - this.featureMean[f]) / this.featureStd[f]),
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }
}
