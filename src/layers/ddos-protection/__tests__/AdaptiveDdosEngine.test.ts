import { describe, it, expect, beforeEach } from 'bun:test';
import { AdaptiveThresholdTuner } from '../engine2/AdaptiveThresholdTuner';
import { AttackClassifier } from '../engine2/AttackClassifier';
import { MitigationPlaybookEngine } from '../engine2/MitigationPlaybook';
import { TrafficScorer } from '../engine2/TrafficScorer';
import { AdaptiveDdosEngine } from '../engine2/AdaptiveDdosEngine';
import { AttackClass, MitigationState, TestClock } from '../engine2/types';
import type { TrafficSample } from '../engine2/types';

function sample(over: Partial<TrafficSample> = {}): TrafficSample {
  return {
    at: 0,
    requests: 1000,
    bytes: 500_000,
    uniqueIps: 800,
    synCount: 100,
    l7Count: 900,
    establishedCount: 850,
    errorCount: 5,
    ...over,
  };
}

/* ------------------------------------------------------------------ */

describe('AdaptiveThresholdTuner', () => {
  let clock: TestClock;
  let tuner: AdaptiveThresholdTuner;

  beforeEach(() => {
    clock = new TestClock(1_000_000);
    tuner = new AdaptiveThresholdTuner({ minSamples: 10, sensitivity: 4 }, clock);
  });

  it('learns a baseline and reports warm after minSamples', () => {
    for (let i = 0; i < 10; i++) {
      tuner.learn(sample({ requests: 1000 + (i % 5) * 20 }));
    }
    const t = tuner.threshold('requests');
    expect(t.warm).toBe(true);
    expect(t.mean).toBeGreaterThan(900);
    expect(t.alertLevel).toBeGreaterThan(t.mean);
  });

  it('is not warm before minSamples and does not alert', () => {
    for (let i = 0; i < 5; i++) tuner.learn(sample());
    const t = tuner.threshold('requests');
    expect(t.warm).toBe(false);
    const r = tuner.detect(sample({ requests: 1_000_000 }));
    expect(r.anomalous.length).toBe(0); // cold baseline — advisory only
  });

  it('flags a spike that clears μ + k·σ', () => {
    for (let i = 0; i < 30; i++) tuner.learn(sample({ requests: 1000 + (i % 7) * 10 }));
    const spike = sample({ requests: 50_000 });
    const r = tuner.detect(spike);
    expect(r.anomalous).toContain('requests');
    expect(r.worst!.metric).toBe('requests');
    expect(r.worst!.z).toBeGreaterThan(4);
  });

  it('does not learn from anomalous samples (baseline poisoning defence)', () => {
    for (let i = 0; i < 30; i++) tuner.learn(sample({ requests: 1000 }));
    const before = tuner.threshold('requests').mean;
    // Feed a huge spike through observe() — it should NOT be learned.
    const r = tuner.observe(sample({ requests: 200_000 }));
    expect(r.learned).toBe(false);
    expect(tuner.threshold('requests').mean).toBe(before);
  });

  it('tracks genuine gradual growth via EMA (no false alert on organic ramp)', () => {
    for (let i = 0; i < 30; i++) tuner.learn(sample({ requests: 1000 }));
    // Organic growth with a trusted label (operator knows it's legit —
    // e.g. steady product adoption): feed via learn() directly. The EMA
    // must follow the ramp rather than pin the baseline at the old level.
    for (let i = 0; i < 200; i++) {
      tuner.learn(sample({ requests: 1000 * Math.pow(1.02, i) }));
    }
    const t = tuner.threshold('requests');
    expect(t.mean).toBeGreaterThan(10_000); // followed the ramp
    // A flat window at the new level must not alert — it's the new normal.
    const steady = tuner.detect(sample({ requests: 50_000 }));
    expect(steady.anomalous).not.toContain('requests');
  });

  it('floors the alert level at minAbsolute for quiet traffic', () => {
    for (let i = 0; i < 15; i++) tuner.learn(sample({ requests: 0.001, errorCount: 0 }));
    const t = tuner.threshold('requests');
    expect(t.alertLevel).toBeGreaterThanOrEqual(1);
  });

  it('adjust() rescales the baseline for known regime changes', () => {
    for (let i = 0; i < 15; i++) tuner.learn(sample({ requests: 1000 }));
    tuner.adjust('requests', 3);
    expect(tuner.threshold('requests').mean).toBeCloseTo(3000, -1);
  });
});

/* ------------------------------------------------------------------ */

describe('AttackClassifier', () => {
  let clf: AttackClassifier;
  const WINDOW = 60_000;

  beforeEach(() => {
    clf = new AttackClassifier();
  });

  it('classifies a SYN flood as protocol', () => {
    // Huge request count, 90% SYNs, almost nothing established, tiny payloads.
    const s = sample({
      requests: 600_000,
      synCount: 560_000,
      establishedCount: 20_000,
      l7Count: 10_000,
      bytes: 60_000_000, // ~100B/req
      uniqueIps: 100_000,
    });
    const ev = clf.buildEvidence([s], WINDOW, 5);
    const r = clf.classify(ev);
    expect(r.attackClass).toBe(AttackClass.Protocol);
    expect(r.confidence).toBeGreaterThan(0.55);
    expect(r.signatureScores['syn-flood']).toBeGreaterThan(0.55);
  });

  it('classifies a UDP amplification as volumetric', () => {
    const s = sample({
      requests: 200_000,
      bytes: 20_000_000_000, // 20GB in a minute → ~333MB/s, 100KB/req
      synCount: 1_000,
      l7Count: 5_000,
      establishedCount: 3_000,
      uniqueIps: 50_000,
    });
    const ev = clf.buildEvidence([s], WINDOW, 0);
    const r = clf.classify(ev);
    expect(r.attackClass).toBe(AttackClass.Volumetric);
  });

  it('classifies a distributed HTTP flood as application', () => {
    const s = sample({
      requests: 120_000, // 2k rps
      bytes: 300_000_000,
      l7Count: 118_000,
      synCount: 20_000,
      establishedCount: 100_000,
      uniqueIps: 40_000, // 3 req/IP — botnet distribution
    });
    const ev = clf.buildEvidence([s], WINDOW, 4); // hits 4 endpoints
    const r = clf.classify(ev);
    expect(r.attackClass).toBe(AttackClass.Application);
    expect(r.signatureScores['http-flood']).toBeGreaterThan(0.55);
  });

  it('returns unknown for ambiguous low-evidence windows', () => {
    const ev = clf.buildEvidence([sample()], WINDOW, 50);
    const r = clf.classify(ev);
    // Normal traffic shouldn't hit any signature hard.
    expect(r.attackClass).toBe(AttackClass.Unknown);
    expect(r.confidence).toBeLessThan(0.55);
  });

  it('exposes per-signature scores for hybrid attacks', () => {
    // SYN-flood-ish but also high L7 share — hybrid.
    const s = sample({
      requests: 300_000,
      synCount: 200_000,
      establishedCount: 40_000,
      l7Count: 80_000,
      bytes: 90_000_000,
      uniqueIps: 60_000,
    });
    const ev = clf.buildEvidence([s], WINDOW, 3);
    const r = clf.classify(ev);
    const nonZero = Object.values(r.signatureScores).filter((v) => v > 0);
    expect(nonZero.length).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */

describe('MitigationPlaybookEngine', () => {
  let clock: TestClock;
  let engine: MitigationPlaybookEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new MitigationPlaybookEngine({ quietMs: 60_000, cooldownMs: 120_000 }, clock);
  });

  it('stays idle while no attack', () => {
    const s = engine.evaluate(AttackClass.Unknown, false);
    expect(s.state).toBe(MitigationState.Idle);
    expect(s.currentAction).toBe('none');
  });

  it('starts at the first playbook step on attack', () => {
    const s = engine.evaluate(AttackClass.Application, true);
    expect(s.state).toBe(MitigationState.Mitigating);
    expect(s.stepIndex).toBe(0);
    expect(s.currentAction).toBe('monitor');
  });

  it('escalates when the attack outlives the step dwell', () => {
    engine.evaluate(AttackClass.Application, true);
    // application playbook: monitor dwells 15s → rate-limit.
    clock.advance(16_000);
    const s = engine.evaluate(AttackClass.Application, true);
    expect(s.stepIndex).toBe(1);
    expect(s.currentAction).toBe('rate-limit');
    expect(s.escalations).toBe(1);
  });

  it('climbs to the top rung and holds', () => {
    engine.evaluate(AttackClass.Protocol, true); // monitor (5s)
    for (let i = 0; i < 10; i++) {
      clock.advance(400_000); // outlive every dwell
      engine.evaluate(AttackClass.Protocol, true);
    }
    const s = engine.evaluate(AttackClass.Protocol, true);
    // protocol playbook tops out at blackhole (index 3).
    expect(s.currentAction).toBe('blackhole');
    expect(s.escalations).toBe(3);
  });

  it('de-escalates through cooldown when the attack subsides', () => {
    engine.evaluate(AttackClass.Volumetric, true);
    clock.advance(20_000);
    engine.evaluate(AttackClass.Volumetric, true); // escalated once
    // Attack stops — quiet for quietMs (needs two quiet evaluations:
    // the first starts the quiet clock, the second crosses it).
    clock.advance(61_000);
    engine.evaluate(AttackClass.Unknown, false); // quiet clock starts here
    clock.advance(61_000);                        // a full quietMs of quiet
    const s1 = engine.evaluate(AttackClass.Unknown, false);
    expect(s1.state).toBe(MitigationState.Cooldown);
    clock.advance(121_000);
    const s2 = engine.evaluate(AttackClass.Unknown, false);
    expect(s2.state).toBe(MitigationState.Idle);
    expect(s2.stepIndex).toBe(-1);
  });

  it('resumes the same rung on relapse during cooldown (hysteresis)', () => {
    engine.evaluate(AttackClass.Protocol, true);
    clock.advance(400_000);
    engine.evaluate(AttackClass.Protocol, true); // escalated to step 1
    clock.advance(61_000);
    engine.evaluate(AttackClass.Unknown, false); // quiet clock starts
    clock.advance(61_000);
    engine.evaluate(AttackClass.Unknown, false); // → cooldown at step 1
    clock.advance(10_000);
    const s = engine.evaluate(AttackClass.Protocol, true); // relapse
    expect(s.state).toBe(MitigationState.Mitigating);
    expect(s.stepIndex).toBe(1); // same rung, not reset to monitor
  });
});

/* ------------------------------------------------------------------ */

describe('TrafficScorer', () => {
  let clock: TestClock;
  let scorer: TrafficScorer;

  beforeEach(() => {
    clock = new TestClock(0);
    scorer = new TrafficScorer({ halfLifeMs: 60_000, expectedRequestsPerIp: 10 }, clock);
  });

  it('accumulates score from flags and volume', () => {
    scorer.observe([
      { ip: '1.2.3.4', at: clock.now(), requests: 500, flagged: true },
    ]);
    const s = scorer.score('1.2.3.4');
    expect(s).toBeGreaterThan(25); // flag weight alone
  });

  it('decays score with the configured half-life', () => {
    scorer.observe([{ ip: 'a', at: 0, requests: 100, flagged: true }]);
    const s0 = scorer.score('a');
    clock.advance(60_000); // one half-life
    const s1 = scorer.score('a');
    expect(s1).toBeCloseTo(s0 / 2, 0);
  });

  it('challenge failures weigh heavily', () => {
    scorer.observe([
      { ip: 'bot', at: 0, requests: 5, flagged: false, challengeFailed: true },
    ]);
    expect(scorer.score('bot')).toBeGreaterThanOrEqual(30);
  });

  it('snapshot ranks IPs and reports trend', () => {
    for (let w = 0; w < 6; w++) {
      scorer.observe([
        { ip: 'persistent', at: w * 10_000, requests: 300, flagged: true },
        { ip: 'occasional', at: w * 10_000, requests: 30, flagged: w === 5 },
      ]);
      clock.set(w * 10_000 + 1);
    }
    const snap = scorer.snapshot();
    expect(snap.topIps[0].ip).toBe('persistent');
    expect(snap.topIps[0].trend).toBe('rising');
    expect(snap.highRiskCount).toBeGreaterThanOrEqual(1);
  });

  it('evicts long-idle decayed IPs to bound memory', () => {
    scorer.observe([{ ip: 'quiet', at: 0, requests: 1, flagged: false }]);
    expect(scorer.trackedIps()).toBe(1);
    clock.advance(10 * 60_000); // way past eviction window for ~0 score
    scorer.observe([{ ip: 'other', at: clock.now(), requests: 5, flagged: false }]);
    expect(scorer.trackedIps()).toBe(1); // 'quiet' evicted, 'other' added
  });
});

/* ------------------------------------------------------------------ */

describe('AdaptiveDdosEngine (integration)', () => {
  it('runs the full pipeline: learn → detect → classify → mitigate → score', () => {
    const clock = new TestClock(0);
    const engine = new AdaptiveDdosEngine({ clock, windowMs: 60_000 });

    // Phase 1: warm the baseline with normal traffic.
    for (let i = 0; i < 20; i++) {
      clock.set(i * 60_000);
      engine.ingest(sample({ at: i * 60_000, requests: 1000 + (i % 4) * 10 }));
      const r = engine.assess();
      expect(r.baselineUpdated).toBe(true);
      expect(r.mitigation.state).toBe(MitigationState.Idle);
    }

    // Phase 2: SYN flood arrives.
    clock.set(21 * 60_000);
    engine.ingest(
      sample({
        at: clock.now(),
        requests: 600_000,
        synCount: 560_000,
        establishedCount: 15_000,
        l7Count: 8_000,
        bytes: 60_000_000,
        uniqueIps: 100_000,
      })
    );
    const r2 = engine.assess(0, [
      { ip: '6.6.6.6', at: clock.now(), requests: 50_000, flagged: true },
    ]);

    expect(r2.baselineUpdated).toBe(false); // attack not learned
    expect(r2.classification.attackClass).toBe(AttackClass.Protocol);
    expect(r2.mitigation.state).toBe(MitigationState.Mitigating);
    expect(r2.mitigation.currentAction).toBe('monitor');
    expect(engine.scorer.score('6.6.6.6')).toBeGreaterThan(0);

    // Phase 3: attack persists past dwell → escalate.
    clock.advance(6_000);
    engine.ingest(
      sample({
        at: clock.now(),
        requests: 700_000,
        synCount: 650_000,
        establishedCount: 10_000,
        l7Count: 5_000,
        bytes: 70_000_000,
        uniqueIps: 110_000,
      })
    );
    const r3 = engine.assess();
    expect(r3.mitigation.stepIndex).toBe(1); // escalated past monitor
  });

  it('ignores lone spikes the classifier cannot name (false-positive guard)', () => {
    const clock = new TestClock(0);
    const engine = new AdaptiveDdosEngine({ clock });
    for (let i = 0; i < 20; i++) {
      clock.set(i * 60_000);
      engine.ingest(sample({ at: i * 60_000 }));
      engine.assess();
    }
    clock.set(21 * 60_000);
    // Moderate anomaly — thresholds fire but no signature matches.
    engine.ingest(sample({ at: clock.now(), requests: 90_000, bytes: 45_000_000 }));
    const r = engine.assess();
    expect(r.anomalousMetrics.length).toBeGreaterThan(0);
    expect(r.mitigation.state).toBe(MitigationState.Idle); // classifier said unknown → no action
  });
});
