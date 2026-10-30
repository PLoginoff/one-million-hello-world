/**
 * Canary Deploy engine2 — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MultiMetricAnalyzer } from '../engine2/MultiMetricVerdict';
import { RollbackTriggerEngine, rollbackTriggers } from '../engine2/RollbackTriggerEngine';
import { PromotionGateController, promotionGates, PromotionGateError } from '../engine2/PromotionGateController';
import { ShadowComparisonAnalyzer } from '../engine2/ShadowComparisonAnalyzer';
import { CanaryDecisionEngine } from '../engine2/CanaryDecisionEngine';
import { MetricTolerance, MetricSample, ShadowExchange } from '../engine2/CanaryEngine2Types';

// Manual clock.
function manualClock(start = 1_000_000) {
  let t = start;
  return {
    clock: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

const tolerances: MetricTolerance[] = [
  { metric: 'errors', direction: 'higher-is-worse', relative: 0.1, weight: 3, minSamples: 5 },
  { metric: 'latency', direction: 'higher-is-worse', relative: 0.2, weight: 2, minSamples: 5 },
  { metric: 'saturation', direction: 'higher-is-worse', relative: 0.1, weight: 1, minSamples: 5 },
];

function feed(analyzer: MultiMetricAnalyzer, at: number, values: { metric: string; live: number[]; canary: number[] }[]): void {
  for (const v of values) {
    for (const x of v.live) analyzer.record({ metric: v.metric, cohort: 'live', value: x, at });
    for (const x of v.canary) analyzer.record({ metric: v.metric, cohort: 'canary', value: x, at });
  }
}

// ------------------------------------------------------------ MultiMetricAnalyzer

describe('MultiMetricAnalyzer', () => {
  const mc = manualClock();
  let analyzer: MultiMetricAnalyzer;

  beforeEach(() => {
    analyzer = new MultiMetricAnalyzer(tolerances, {
      clock: mc.clock,
      windowMs: 60_000,
      errorMetrics: [{ metric: 'errors', errorThreshold: 1 }],
    });
  });

  it('reports insufficient-data before minSamples', () => {
    feed(analyzer, mc.now(), [{ metric: 'errors', live: [0, 0, 0], canary: [0, 0] }]);
    const v = analyzer.evaluate();
    expect(v.status).toBe('insufficient-data');
    expect(v.insufficientMetrics).toContain('errors');
  });

  it('healthy when canary matches live', () => {
    feed(analyzer, mc.now(), [
      { metric: 'errors', live: [0, 0, 0, 0, 0], canary: [0, 0, 0, 0, 0] },
      { metric: 'latency', live: [100, 110, 105, 100, 95], canary: [100, 108, 104, 98, 99] },
      { metric: 'saturation', live: [0.5, 0.5, 0.5, 0.5, 0.5], canary: [0.5, 0.5, 0.5, 0.5, 0.5] },
    ]);
    const v = analyzer.evaluate();
    expect(v.status).toBe('healthy');
    expect(v.failingMetrics).toHaveLength(0);
    expect(v.score).toBeGreaterThan(0.9);
  });

  it('degraded when canary is worse but inside tolerance', () => {
    feed(analyzer, mc.now(), [
      { metric: 'errors', live: [0, 0, 0, 0, 0], canary: [0, 0, 0, 0, 0] },
      // live mean 100, canary 110 → +10%, tolerance 20% → degraded
      { metric: 'latency', live: [100, 100, 100, 100, 100], canary: [110, 110, 110, 110, 110] },
      { metric: 'saturation', live: [0.5, 0.5, 0.5, 0.5, 0.5], canary: [0.5, 0.5, 0.5, 0.5, 0.5] },
    ]);
    const v = analyzer.evaluate();
    expect(v.status).toBe('degraded');
    const lat = v.contributions.find((c) => c.metric === 'latency')!;
    expect(lat.verdict).toBe('degraded');
  });

  it('unhealthy when a metric exceeds tolerance', () => {
    feed(analyzer, mc.now(), [
      { metric: 'errors', live: [0, 0, 0, 0, 0], canary: [1, 1, 1, 1, 1] }, // 100% error rate
      { metric: 'latency', live: [100, 100, 100, 100, 100], canary: [100, 100, 100, 100, 100] },
      { metric: 'saturation', live: [0.5, 0.5, 0.5, 0.5, 0.5], canary: [0.5, 0.5, 0.5, 0.5, 0.5] },
    ]);
    const v = analyzer.evaluate();
    expect(v.status).toBe('unhealthy');
    expect(v.failingMetrics).toContain('errors');
  });

  it('compares error metrics by errorRate, not mean', () => {
    // 2/5 canary errors = 40% error rate vs live 0% — catastrophic.
    feed(analyzer, mc.now(), [
      { metric: 'errors', live: [0, 0, 0, 0, 0], canary: [0, 0, 0, 1, 1] },
      { metric: 'latency', live: [100, 100, 100, 100, 100], canary: [100, 100, 100, 100, 100] },
      { metric: 'saturation', live: [0.5, 0.5, 0.5, 0.5, 0.5], canary: [0.5, 0.5, 0.5, 0.5, 0.5] },
    ]);
    const v = analyzer.evaluate();
    const err = v.contributions.find((c) => c.metric === 'errors')!;
    expect(err.canary.errorRate).toBeCloseTo(0.4);
    expect(err.verdict).toBe('fail');
  });

  it('respects absolute bounds over relative', () => {
    const abs = new MultiMetricAnalyzer(
      [{ metric: 'latency', direction: 'higher-is-worse', relative: 5, absolute: 150, weight: 1, minSamples: 1 }],
      { clock: mc.clock, windowMs: 60_000 }
    );
    feed(abs, mc.now(), [{ metric: 'latency', live: [100], canary: [160] }]);
    // relative tolerance 500% would allow 160, but absolute 150 caps it.
    expect(abs.evaluate().status).toBe('unhealthy');
  });

  it('computes window statistics (p50/p99)', () => {
    const w = (() => {
      feed(analyzer, mc.now(), [
        { metric: 'latency', live: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], canary: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
        { metric: 'errors', live: [0, 0, 0, 0, 0], canary: [0, 0, 0, 0, 0] },
        { metric: 'saturation', live: [0.5, 0.5, 0.5, 0.5, 0.5], canary: [0.5, 0.5, 0.5, 0.5, 0.5] },
      ]);
      return analyzer.aggregate('latency', 'canary');
    })();
    expect(w.count).toBe(10);
    expect(w.p50).toBe(50);
    expect(w.max).toBe(100);
  });
});

// ------------------------------------------------------------ RollbackTriggerEngine

describe('RollbackTriggerEngine', () => {
  const mc = manualClock();

  function verdict(status: 'healthy' | 'unhealthy' | 'degraded', score = 0.5): import('../engine2/CanaryEngine2Types').CombinedVerdict {
    return {
      at: mc.now(),
      status,
      score,
      contributions: [],
      failingMetrics: status === 'unhealthy' ? ['errors'] : [],
      insufficientMetrics: [],
      reason: '',
    };
  }

  it('requires sustained windows before firing', () => {
    const engine = new RollbackTriggerEngine(
      [rollbackTriggers.anyUnhealthy({ sustainedWindows: 3 })],
      { clock: mc.clock }
    );
    expect(engine.evaluate(verdict('unhealthy'))).toBeNull();
    expect(engine.consecutiveCount('any-unhealthy')).toBe(1);
    expect(engine.evaluate(verdict('unhealthy'))).toBeNull();
    const d = engine.evaluate(verdict('unhealthy'));
    expect(d).not.toBeNull();
    expect(d!.trigger).toBe('any-unhealthy');
  });

  it('a passing window resets the consecutive count', () => {
    const engine = new RollbackTriggerEngine(
      [rollbackTriggers.anyUnhealthy({ sustainedWindows: 2 })],
      { clock: mc.clock }
    );
    engine.evaluate(verdict('unhealthy'));
    engine.evaluate(verdict('healthy'));
    expect(engine.consecutiveCount('any-unhealthy')).toBe(0);
    expect(engine.evaluate(verdict('unhealthy'))).toBeNull(); // only 1 window
  });

  it('errorRateCeiling fires on absolute canary error rate', () => {
    const engine = new RollbackTriggerEngine(
      [rollbackTriggers.errorRateCeiling('errors', 0.05)],
      { clock: mc.clock }
    );
    const v = verdict('healthy');
    const withErr = {
      ...v,
      contributions: [
        {
          metric: 'errors',
          canary: { errorRate: 0.2 } as never,
          live: { errorRate: 0.01 } as never,
          verdict: 'pass' as const,
          deviation: 0,
          reason: '',
        },
      ],
    };
    const d = engine.evaluate(withErr);
    expect(d).not.toBeNull();
    expect(d!.reason).toContain('error rate');
  });

  it('cooldown suppresses re-firing', () => {
    const engine = new RollbackTriggerEngine(
      [rollbackTriggers.anyUnhealthy({ sustainedWindows: 1, cooldownMs: 10_000 })],
      { clock: mc.clock }
    );
    expect(engine.evaluate(verdict('unhealthy'))).not.toBeNull();
    mc.advance(5_000);
    expect(engine.evaluate(verdict('unhealthy'))).toBeNull(); // in cooldown
    mc.advance(10_000);
    expect(engine.evaluate(verdict('unhealthy'))).not.toBeNull(); // cooldown expired
  });

  it('rejects duplicate trigger names', () => {
    expect(
      () =>
        new RollbackTriggerEngine([
          rollbackTriggers.anyUnhealthy(),
          rollbackTriggers.anyUnhealthy(),
        ])
    ).toThrow();
  });
});

// ------------------------------------------------------------ PromotionGateController

describe('PromotionGateController', () => {
  const mc = manualClock();

  function verdict(status: 'healthy' | 'unhealthy'): import('../engine2/CanaryEngine2Types').CombinedVerdict {
    return {
      at: mc.now(),
      status,
      score: status === 'healthy' ? 1 : 0,
      contributions: [],
      failingMetrics: [],
      insufficientMetrics: [],
      reason: '',
    };
  }

  it('blocks promotion until automated gate passes', () => {
    const gates = new PromotionGateController([promotionGates.allHealthy(3)], { clock: mc.clock });
    gates.record(verdict('healthy'));
    gates.record(verdict('healthy'));
    expect(gates.canPromote()).toBe(false);
    gates.record(verdict('unhealthy'));
    gates.record(verdict('healthy'));
    expect(gates.canPromote()).toBe(false); // last 3 not all healthy
    gates.record(verdict('healthy'));
    gates.record(verdict('healthy'));
    expect(gates.canPromote()).toBe(true);
  });

  it('manual gate requires explicit approval', () => {
    const gates = new PromotionGateController(
      [promotionGates.allHealthy(1), promotionGates.manualSignoff('sre-approval')],
      { clock: mc.clock }
    );
    gates.record(verdict('healthy'));
    expect(gates.canPromote()).toBe(false);
    expect(gates.blockingReason()).toContain('sre-approval');
    gates.approve('sre-approval', 'alice@example.com');
    expect(gates.canPromote()).toBe(true);
  });

  it('unhealthy verdict revokes manual approvals', () => {
    const gates = new PromotionGateController([promotionGates.manualSignoff('signoff')], {
      clock: mc.clock,
      revokeOnUnhealthy: true,
    });
    gates.approve('signoff', 'bob');
    expect(gates.canPromote()).toBe(true);
    gates.record(verdict('unhealthy'));
    expect(gates.canPromote()).toBe(false);
  });

  it('rejects approving an automated gate manually', () => {
    const gates = new PromotionGateController([promotionGates.allHealthy(1)]);
    expect(() => gates.approve('all-healthy-1', 'x')).toThrow(PromotionGateError);
  });

  it('rejects automated gate without predicate', () => {
    expect(() => new PromotionGateController([{ name: 'bad', kind: 'automated' }])).toThrow(
      PromotionGateError
    );
  });
});

// ------------------------------------------------------------ ShadowComparisonAnalyzer

describe('ShadowComparisonAnalyzer', () => {
  let analyzer: ShadowComparisonAnalyzer;

  function exchange(
    id: string,
    path: string,
    liveBody: unknown,
    shadowBody: unknown,
    opts: { liveStatus?: number; shadowStatus?: number; shadowError?: string; liveMs?: number; shadowMs?: number } = {}
  ): ShadowExchange {
    return {
      requestId: id,
      path,
      at: 0,
      live: { status: opts.liveStatus ?? 200, body: liveBody, latencyMs: opts.liveMs ?? 50 },
      shadow: { status: opts.shadowStatus ?? 200, body: shadowBody, latencyMs: opts.shadowMs ?? 60, error: opts.shadowError },
    };
  }

  beforeEach(() => {
    analyzer = new ShadowComparisonAnalyzer({ numericTolerance: 0.001 });
  });

  it('identical responses produce no divergence', () => {
    const d = analyzer.compare(exchange('r1', '/a', { x: 1, y: 'z' }, { x: 1, y: 'z' }));
    expect(d).toBeNull();
    expect(analyzer.report().divergenceRate).toBe(0);
  });

  it('detects deep body mismatches with JSON paths', () => {
    const d = analyzer.compare(
      exchange('r2', '/u', { user: { name: 'a', tags: ['x', 'y'] } }, { user: { name: 'b', tags: ['x', 'z'] } })
    );
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('body-mismatch');
    expect(d!.diffPaths).toContain('user.name');
    expect(d!.diffPaths).toContain('user.tags[1]');
  });

  it('numeric tolerance suppresses tiny float diffs', () => {
    const d = analyzer.compare(exchange('r3', '/p', { price: 100.0 }, { price: 100.05 }));
    expect(d).toBeNull(); // 0.05% < 0.1% tolerance
  });

  it('status mismatch is classified separately', () => {
    const d = analyzer.compare(exchange('r4', '/s', {}, {}, { liveStatus: 200, shadowStatus: 500 }));
    expect(d!.kind).toBe('status-mismatch');
  });

  it('shadow error is classified and counted as errored', () => {
    const d = analyzer.compare(exchange('r5', '/e', {}, undefined, { shadowError: 'ECONNREFUSED' }));
    expect(d!.kind).toBe('shadow-error');
    expect(analyzer.report().errored).toBe(1);
  });

  it('ignored paths are skipped in body diffs', () => {
    const a = new ShadowComparisonAnalyzer({ ignorePaths: ['meta.requestId'] });
    const d = a.compare(exchange('r6', '/m', { meta: { requestId: 'l1' }, v: 1 }, { meta: { requestId: 's1' }, v: 1 }));
    expect(d).toBeNull();
  });

  it('report aggregates hot paths and latency percentiles', () => {
    analyzer.compare(exchange('a', '/hot', { x: 1 }, { x: 2 }));
    analyzer.compare(exchange('b', '/hot', { x: 1 }, { x: 3 }));
    analyzer.compare(exchange('c', '/cold', { x: 1 }, { x: 1 }));
    const r = analyzer.report();
    expect(r.total).toBe(3);
    expect(r.diverged).toBe(2);
    expect(r.hotPaths[0].path).toBe('/hot');
    expect(r.hotPaths[0].divergences).toBe(2);
    expect(r.latency.p99Delta).toBe(10); // 60 - 50
  });
});

// ------------------------------------------------------------ CanaryDecisionEngine

describe('CanaryDecisionEngine', () => {
  const mc = manualClock();

  it('recommends rollback when a trigger fires', () => {
    const engine = new CanaryDecisionEngine({
      tolerances: [{ metric: 'errors', direction: 'higher-is-worse', relative: 0.1, weight: 1, minSamples: 1 }],
      triggers: [rollbackTriggers.anyUnhealthy({ sustainedWindows: 1 })],
      gates: [promotionGates.allHealthy(1)],
      clock: mc.clock,
      windowMs: 60_000,
      errorMetrics: [{ metric: 'errors' }],
    });
    engine.record({ metric: 'errors', cohort: 'live', value: 0, at: mc.now() });
    engine.record({ metric: 'errors', cohort: 'canary', value: 1, at: mc.now() });
    const rec = engine.decide();
    expect(rec.action).toBe('rollback');
  });

  it('recommends promote only when stage complete and gates pass', () => {
    const engine = new CanaryDecisionEngine({
      tolerances: [{ metric: 'latency', direction: 'higher-is-worse', relative: 0.5, weight: 1, minSamples: 1 }],
      triggers: [rollbackTriggers.anyUnhealthy()],
      gates: [promotionGates.allHealthy(1), promotionGates.manualSignoff('signoff')],
      clock: mc.clock,
      windowMs: 60_000,
    });
    engine.record({ metric: 'latency', cohort: 'live', value: 100, at: mc.now() });
    engine.record({ metric: 'latency', cohort: 'canary', value: 100, at: mc.now() });
    expect(engine.decide(false).action).toBe('continue');
    const awaiting = engine.decide(true);
    expect(awaiting.action).toBe('awaiting-approval');
    engine.approve('signoff', 'release-manager');
    // record one more healthy verdict then re-decide
    engine.record({ metric: 'latency', cohort: 'live', value: 100, at: mc.now() });
    engine.record({ metric: 'latency', cohort: 'canary', value: 100, at: mc.now() });
    expect(engine.decide(true).action).toBe('promote');
  });
});
