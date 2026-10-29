import { describe, it, expect } from 'bun:test';
import {
  fingerprintSimilarity,
  subnet24,
  isDatacenterIp,
  DeviceSpoofRule,
  IpChurnRule,
  CadenceRule,
} from '../implementations/signals/DeviceSignals';
import {
  extractFeatures,
  LogisticFraudScorer,
  FEATURE_COUNT,
} from '../implementations/ml/FeatureExtractor';
import { LinkAnalyzer } from '../implementations/network/LinkAnalysis';
import { Transaction, UserProfile } from '../implementations/fraud/Types';

const NOW = 1_700_000_000_000;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    userId: 'u1',
    amount: 50,
    currency: 'USD',
    timestamp: NOW,
    channel: 'online',
    deviceId: 'dev-1',
    ...overrides,
  };
}

describe('DeviceSignals', () => {
  it('fingerprintSimilarity scores field overlap', () => {
    const a = {
      deviceId: 'd1',
      userAgent: 'Chrome/120',
      timezone: 'UTC',
      platform: 'linux',
    };
    const b = { ...a, timezone: 'PST' };
    const c = {
      deviceId: 'd1',
      userAgent: 'curl/7.0',
      timezone: 'CST',
      platform: 'windows',
    };
    expect(fingerprintSimilarity(a, a)).toBe(1);
    expect(fingerprintSimilarity(a, b)).toBeGreaterThan(0.5);
    expect(fingerprintSimilarity(a, b)).toBeLessThan(1);
    expect(fingerprintSimilarity(a, c)).toBeLessThan(fingerprintSimilarity(a, b));
  });

  it('subnet24 parses ipv4', () => {
    expect(subnet24('192.168.1.50')).toBe('192.168.1');
    expect(subnet24('not-an-ip')).toBeNull();
    expect(isDatacenterIp('52.1.2.3')).toBe(true);
    expect(isDatacenterIp('98.1.2.3')).toBe(false);
  });

  it('DeviceSpoofRule flags fingerprint changes on same device', () => {
    const rule = new DeviceSpoofRule(0.8);
    const prior: Transaction[] = [
      tx({
        deviceId: 'dev-1',
        timestamp: NOW - 3600_000,
        metadata: { fingerprint: { userAgent: 'Chrome', timezone: 'UTC', platform: 'linux' } },
      }),
    ];
    const profile: UserProfile = { userId: 'u1', priorTransactions: prior };
    const spoofed = tx({
      metadata: { fingerprint: { userAgent: 'curl', timezone: 'PST', platform: 'windows' } },
    });
    const s = rule.evaluate({ transaction: spoofed, profile });
    expect(s.triggered).toBe(true);
  });

  it('IpChurnRule detects subnet churn', () => {
    const rule = new IpChurnRule(86_400_000, 2);
    const prior: Transaction[] = [
      tx({ ipAddress: '1.2.3.4', timestamp: NOW - 1000 }),
      tx({ ipAddress: '5.6.7.8', timestamp: NOW - 2000 }),
      tx({ ipAddress: '9.10.11.12', timestamp: NOW - 3000 }),
    ];
    const profile: UserProfile = { userId: 'u1', priorTransactions: prior };
    const s = rule.evaluate({ transaction: tx({ ipAddress: '20.30.40.50' }), profile });
    expect(s.triggered).toBe(true);
  });

  it('CadenceRule detects bot-like regularity', () => {
    const rule = new CadenceRule(2000);
    const prior: Transaction[] = Array.from({ length: 5 }, (_, i) =>
      tx({ timestamp: NOW - (5 - i) * 1000 })
    );
    const profile: UserProfile = { userId: 'u1', priorTransactions: prior };
    const s = rule.evaluate({ transaction: tx({ timestamp: NOW }), profile });
    expect(s.triggered).toBe(true);
  });
});

describe('FeatureExtractor + LogisticFraudScorer', () => {
  it('extracts a fixed-size feature vector', () => {
    const features = extractFeatures(tx());
    expect(features.length).toBe(FEATURE_COUNT);
    expect(features.every((f) => Number.isFinite(f))).toBe(true);
  });

  it('logistic scorer separates fraud from legit', () => {
    const legitProfile: UserProfile = {
      userId: 'u1',
      priorTransactions: Array.from({ length: 10 }, (_, i) =>
        tx({ amount: 40 + i, timestamp: NOW - (i + 1) * 86_400_000, deviceId: 'dev-1' })
      ),
      knownDevices: new Set(['dev-1']),
    };
    const fraudProfile: UserProfile = {
      userId: 'u2',
      priorTransactions: Array.from({ length: 10 }, (_, i) =>
        tx({ amount: 40 + i, timestamp: NOW - (i + 1) * 86_400_000, deviceId: 'dev-1' })
      ),
      knownDevices: new Set(['dev-1']),
    };
    const examples = [
      // legit: small amounts, known device
      ...Array.from({ length: 20 }, () => ({
        transaction: tx({ amount: 50, deviceId: 'dev-1' }),
        profile: legitProfile,
        fraud: false,
      })),
      // fraud: huge amount, unknown device
      ...Array.from({ length: 20 }, () => ({
        transaction: tx({ amount: 9000, deviceId: 'new-dev' }),
        profile: fraudProfile,
        fraud: true,
      })),
    ];
    const scorer = new LogisticFraudScorer();
    scorer.train(examples, { epochs: 400, learningRate: 0.5 });
    expect(scorer.isTrained()).toBe(true);
    const legitScore = scorer.score(tx({ amount: 50, deviceId: 'dev-1' }), legitProfile);
    const fraudScore = scorer.score(tx({ amount: 9000, deviceId: 'new-dev' }), fraudProfile);
    expect(fraudScore).toBeGreaterThan(legitScore);
    expect(fraudScore).toBeGreaterThan(0.5);
    expect(legitScore).toBeLessThan(0.5);
    const explanation = scorer.explain(tx({ amount: 9000, deviceId: 'new-dev' }), fraudProfile);
    expect(explanation.length).toBe(FEATURE_COUNT);
  });
});

describe('LinkAnalyzer', () => {
  it('finds users sharing a device', () => {
    const la = new LinkAnalyzer();
    la.addTransactions([
      tx({ userId: 'a', deviceId: 'shared' }),
      tx({ userId: 'b', deviceId: 'shared' }),
      tx({ userId: 'c', deviceId: 'shared' }),
      tx({ userId: 'd', deviceId: 'unique' }),
    ]);
    const clusters = la.sharedAttributeClusters('deviceId');
    expect(clusters.length).toBe(1);
    expect(clusters[0].userIds).toEqual(['a', 'b', 'c']);
  });

  it('detects fraud rings via shared attributes', () => {
    const la = new LinkAnalyzer();
    // ring: a,b,c share device AND ip
    la.addTransactions([
      tx({ userId: 'a', deviceId: 'ring-dev', ipAddress: '1.2.3.4' }),
      tx({ userId: 'b', deviceId: 'ring-dev', ipAddress: '1.2.3.4' }),
      tx({ userId: 'c', deviceId: 'ring-dev', ipAddress: '1.2.3.4' }),
      tx({ userId: 'clean', deviceId: 'own-dev', ipAddress: '9.9.9.9' }),
    ]);
    const rings = la.detectRings(3);
    expect(rings.length).toBe(1);
    expect(rings[0].userIds).toEqual(['a', 'b', 'c']);
    expect(rings[0].sharedAttributes.length).toBeGreaterThanOrEqual(2);
    expect(la.userRisk('a', rings)).toBeGreaterThan(0);
    expect(la.userRisk('clean', rings)).toBe(0);
  });
});
