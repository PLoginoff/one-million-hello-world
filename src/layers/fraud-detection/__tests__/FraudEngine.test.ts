import { describe, it, expect, beforeEach } from 'bun:test';
import {
  FraudEngine,
  TransactionHistory,
} from '../implementations/fraud/FraudEngine';
import {
  VelocityRule,
  AmountAnomalyRule,
  ImpossibleTravelRule,
  NewDeviceRule,
  UnusualHourRule,
  AmountCeilingRule,
  AwayFromHomeRule,
  haversineKm,
} from '../implementations/fraud/Rules';
import {
  AndRule,
  OrRule,
  Transaction,
  UserProfile,
} from '../implementations/fraud/Types';

const NOW = 1_700_000_000_000;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx1',
    userId: 'u1',
    amount: 100,
    currency: 'USD',
    timestamp: NOW,
    channel: 'online',
    deviceId: 'dev-1',
    ...overrides,
  };
}

function history(amounts: number[], deviceId = 'dev-1'): Transaction[] {
  return amounts.map((a, i) =>
    tx({ id: `h${i}`, amount: a, timestamp: NOW - (i + 1) * 86_400_000, deviceId })
  );
}

describe('rules', () => {
  it('VelocityRule triggers above max count', () => {
    const rule = new VelocityRule(3_600_000, 3);
    const recent: Transaction[] = Array.from({ length: 5 }, (_, i) =>
      tx({ id: `v${i}`, timestamp: NOW - i * 60_000 })
    );
    const profile: UserProfile = { userId: 'u1', priorTransactions: recent };
    const s = rule.evaluate({ transaction: tx(), profile });
    expect(s.triggered).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });

  it('VelocityRule does not trigger within limits', () => {
    const rule = new VelocityRule(3_600_000, 10);
    const profile: UserProfile = { userId: 'u1', priorTransactions: history([50, 60]) };
    const s = rule.evaluate({ transaction: tx(), profile });
    expect(s.triggered).toBe(false);
  });

  it('AmountAnomalyRule detects outliers vs history', () => {
    const rule = new AmountAnomalyRule(3, 5);
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: history([40, 42, 41, 39, 43, 40, 44, 41]),
    };
    const normal = rule.evaluate({ transaction: tx({ amount: 45 }), profile });
    expect(normal.triggered).toBe(false);
    const outlier = rule.evaluate({ transaction: tx({ amount: 5000 }), profile });
    expect(outlier.triggered).toBe(true);
    expect(outlier.score).toBeGreaterThan(normal.score);
  });

  it('ImpossibleTravelRule detects teleporting', () => {
    const rule = new ImpossibleTravelRule(900);
    const nyc = { latitude: 40.7, longitude: -74.0 };
    const london = { latitude: 51.5, longitude: -0.1 };
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: [
        tx({ id: 'prev', timestamp: NOW - 30 * 60_000, location: nyc }),
      ],
    };
    const s = rule.evaluate({
      transaction: tx({ location: london }),
      profile,
    });
    expect(s.triggered).toBe(true);
    // sanity: NYC->London is ~5500km in 30 min
    expect(haversineKm(nyc, london)).toBeGreaterThan(5000);
  });

  it('ImpossibleTravelRule allows reasonable travel', () => {
    const rule = new ImpossibleTravelRule(900);
    const nyc = { latitude: 40.7, longitude: -74.0 };
    const philly = { latitude: 39.95, longitude: -75.16 };
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: [
        tx({ id: 'prev', timestamp: NOW - 60 * 60_000, location: nyc }),
      ],
    };
    const s = rule.evaluate({
      transaction: tx({ location: philly }),
      profile,
    });
    expect(s.triggered).toBe(false);
  });

  it('NewDeviceRule flags unknown devices', () => {
    const rule = new NewDeviceRule();
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: [],
      knownDevices: new Set(['dev-1', 'dev-2']),
    };
    expect(rule.evaluate({ transaction: tx({ deviceId: 'dev-1' }), profile }).triggered).toBe(false);
    expect(rule.evaluate({ transaction: tx({ deviceId: 'dev-9' }), profile }).triggered).toBe(true);
  });

  it('UnusualHourRule flags 3am online txns', () => {
    const rule = new UnusualHourRule(1, 5);
    const am3 = new Date('2023-11-14T03:00:00Z').getTime();
    const pm3 = new Date('2023-11-14T15:00:00Z').getTime();
    expect(
      rule.evaluate({ transaction: tx({ timestamp: am3, channel: 'online' }) }).triggered
    ).toBe(true);
    expect(
      rule.evaluate({ transaction: tx({ timestamp: pm3, channel: 'online' }) }).triggered
    ).toBe(false);
    // card-present at 3am is less suspicious per this rule's design
    expect(
      rule.evaluate({ transaction: tx({ timestamp: am3, channel: 'card-present' }) }).triggered
    ).toBe(false);
  });
});

describe('composite rules', () => {
  it('AndRule requires all sub-rules', () => {
    const always = new AmountCeilingRule(10); // triggers on amount>10
    const never = new AmountCeilingRule(10000);
    const and = new AndRule([always, never]);
    const s = and.evaluate({ transaction: tx({ amount: 100 }) });
    expect(s.triggered).toBe(false);
    const and2 = new AndRule([always, new AmountCeilingRule(50)]);
    expect(and2.evaluate({ transaction: tx({ amount: 100 }) }).triggered).toBe(true);
  });

  it('OrRule triggers if any sub-rule does', () => {
    const or = new OrRule([new AmountCeilingRule(10000), new AmountCeilingRule(10)]);
    expect(or.evaluate({ transaction: tx({ amount: 100 }) }).triggered).toBe(true);
  });
});

describe('FraudEngine', () => {
  let engine: FraudEngine;
  beforeEach(() => {
    engine = new FraudEngine(
      [
        new VelocityRule(3_600_000, 5, 20),
        new AmountAnomalyRule(3, 5, 25),
        new ImpossibleTravelRule(900, 35),
        new NewDeviceRule(15),
        new AmountCeilingRule(10_000, 15),
      ],
      { thresholds: { reviewAt: 30, declineAt: 60 } }
    );
  });

  it('approves a normal transaction', () => {
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: history([90, 110, 95, 105, 100, 98]),
      knownDevices: new Set(['dev-1']),
    };
    const r = engine.assess(tx(), profile);
    expect(r.decision).toBe('approve');
    expect(r.score).toBeLessThan(30);
  });

  it('declines on blocklist', () => {
    const e = new FraudEngine([], {
      lists: { blockedDevices: new Set(['dev-1']) },
    });
    const r = e.assess(tx());
    expect(r.decision).toBe('decline');
    expect(r.score).toBe(100);
  });

  it('approves on allowlist', () => {
    const e = new FraudEngine([new AmountCeilingRule(1)], {
      lists: { allowedUsers: new Set(['u1']) },
    });
    const r = e.assess(tx({ amount: 99999 }));
    expect(r.decision).toBe('approve');
  });

  it('escalates review/decline with combined signals', () => {
    const profile: UserProfile = {
      userId: 'u1',
      priorTransactions: [
        ...history([40, 42, 41, 39, 43, 40]),
        tx({ id: 'loc', timestamp: NOW - 10 * 60_000, location: { latitude: 40.7, longitude: -74 } }),
      ],
      knownDevices: new Set(['other-dev']),
    };
    const r = engine.assess(
      tx({
        amount: 9000,
        deviceId: 'unknown-dev',
        location: { latitude: 55.75, longitude: 37.6 }, // Moscow, 30min after NYC
      }),
      profile
    );
    expect(r.decision === 'review' || r.decision === 'decline').toBe(true);
    expect(r.signals.filter((s) => s.triggered).length).toBeGreaterThanOrEqual(2);
    expect(r.explanations.length).toBeGreaterThan(0);
  });
});

describe('TransactionHistory', () => {
  it('builds profiles from recorded transactions', () => {
    const hist = new TransactionHistory();
    for (const t of history([10, 20, 30])) hist.record(t);
    const profile = hist.profileFor('u1');
    expect(profile).toBeDefined();
    expect(profile!.priorTransactions.length).toBe(3);
    expect(profile!.typicalAmount).toBe(20);
    expect(profile!.knownDevices!.has('dev-1')).toBe(true);
  });

  it('bounds history size', () => {
    const hist = new TransactionHistory(5);
    for (let i = 0; i < 10; i++) hist.record(tx({ id: `t${i}` }));
    expect(hist.profileFor('u1')!.priorTransactions.length).toBe(5);
  });
});
