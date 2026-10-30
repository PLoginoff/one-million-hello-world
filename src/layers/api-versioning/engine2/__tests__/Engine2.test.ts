/**
 * Tests for api-versioning engine2: VersionLifecycleManager,
 * VersionUsageTracker, BreakingChangeDetector, VersionedRateLimiter
 * and MigrationGuideGenerator.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BreakingChangeDetector,
  ChangeKind,
  DAY_MS,
  MigrationGuideGenerator,
  SchemaDirection,
  TestClock,
  VersionedRateLimiter,
  VersionLifecycleManager,
  VersionPhase,
  VersionUsageTracker,
} from '..';

describe('VersionLifecycleManager', () => {
  let clock: TestClock;
  let mgr: VersionLifecycleManager;

  beforeEach(() => {
    clock = new TestClock(1_000_000);
    mgr = new VersionLifecycleManager({ clock });
  });

  it('moves a version through the full lifecycle on schedule', () => {
    mgr.register('v1');
    mgr.activate('v1');
    mgr.scheduleTransition('v1', VersionPhase.Deprecated, clock.now() + 30 * DAY_MS);
    mgr.scheduleTransition('v1', VersionPhase.Sunset, clock.now() + 60 * DAY_MS);

    clock.advance(31 * DAY_MS);
    let notices = mgr.tick();
    expect(mgr.lifecycle('v1')!.phase).toBe(VersionPhase.Deprecated);
    expect(notices.some((n) => n.kind === 'deprecation-announced')).toBe(true);

    clock.advance(30 * DAY_MS);
    notices = mgr.tick();
    expect(mgr.lifecycle('v1')!.phase).toBe(VersionPhase.Sunset);
    expect(notices.some((n) => n.kind === 'sunset')).toBe(true);
    expect(mgr.lifecycle('v1')!.history.length).toBe(4);
  });

  it('catches up multiple transitions in a single tick', () => {
    mgr.register('v1');
    mgr.activate('v1');
    // Both transitions already in the past by the time we tick.
    mgr.scheduleTransition('v1', VersionPhase.Deprecated, clock.now() - 10);
    mgr.scheduleTransition('v1', VersionPhase.Sunset, clock.now() - 5);
    const notices = mgr.tick();
    expect(mgr.lifecycle('v1')!.phase).toBe(VersionPhase.Sunset);
    expect(notices.length).toBe(2);
  });

  it('emits sunset-approaching reminders inside the reminder window', () => {
    mgr = new VersionLifecycleManager({ clock, sunsetReminderMs: 10 * DAY_MS });
    mgr.register('v1');
    mgr.activate('v1');
    mgr.scheduleTransition('v1', VersionPhase.Sunset, clock.now() + 8 * DAY_MS);
    const notices = mgr.tick();
    expect(notices.some((n) => n.kind === 'sunset-approaching')).toBe(true);
    // Second tick inside the same window is rate-limited.
    clock.advance(DAY_MS);
    expect(mgr.tick().filter((n) => n.kind === 'sunset-approaching').length).toBe(0);
  });

  it('refuses to schedule a phase regression', () => {
    mgr.register('v1');
    mgr.activate('v1');
    mgr.scheduleTransition('v1', VersionPhase.Deprecated, clock.now());
    mgr.tick();
    expect(() =>
      mgr.scheduleTransition('v1', VersionPhase.Active, clock.now() + DAY_MS)
    ).toThrow();
  });

  it('names clients still calling a deprecated version when usage is wired', () => {
    const usage = new VersionUsageTracker(clock);
    usage.record('acme', 'v1', '/users');
    usage.record('globex', 'v1', '/users');
    mgr = new VersionLifecycleManager({ clock, usage });
    mgr.register('v1');
    mgr.activate('v1');
    mgr.scheduleTransition('v1', VersionPhase.Deprecated, clock.now());
    const notices = mgr.tick();
    expect(notices[0]!.message).toContain('acme');
    expect(notices[0]!.message).toContain('globex');
  });
});

describe('VersionUsageTracker', () => {
  let clock: TestClock;
  let tracker: VersionUsageTracker;

  beforeEach(() => {
    clock = new TestClock(0);
    tracker = new VersionUsageTracker(clock);
  });

  it('aggregates calls per client and version', () => {
    tracker.record('a', 'v1', '/users');
    tracker.record('a', 'v1', '/orders');
    tracker.record('a', 'v2', '/users');
    tracker.record('b', 'v1', '/users');
    expect(tracker.clientsOf('v1')).toEqual(['a', 'b']);
    expect(tracker.versionsOf('a').map((u) => u.version)).toEqual(['v1', 'v2']);
    expect(tracker.versionShare('v1')).toBeCloseTo(0.75);
  });

  it('identifies idle clients for outreach', () => {
    tracker.record('a', 'v1', '/x');
    clock.advance(100 * DAY_MS);
    tracker.record('b', 'v1', '/x');
    expect(tracker.idleClients('v1', 90 * DAY_MS)).toEqual(['a']);
  });

  it('reports endpoint histograms per (client, version)', () => {
    tracker.record('a', 'v1', '/users');
    tracker.record('a', 'v1', '/users');
    tracker.record('a', 'v1', '/orders');
    const hist = tracker.endpointsOf('a', 'v1');
    expect(hist[0]).toEqual({ endpoint: '/users', calls: 2 });
    expect(hist[1]).toEqual({ endpoint: '/orders', calls: 1 });
  });

  it('detects unused versions', () => {
    expect(tracker.isUnused('v9')).toBe(true);
    tracker.record('a', 'v9', '/x');
    expect(tracker.isUnused('v9')).toBe(false);
  });
});

describe('BreakingChangeDetector', () => {
  const det = new BreakingChangeDetector();

  it('flags removed response properties as breaking', () => {
    const before = { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'] } as const;
    const after = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } as const;
    const diff = det.diff(before, after, SchemaDirection.Response);
    expect(diff.hasBreaking).toBe(true);
    expect(diff.changes.find((c) => c.path === 'name')!.reason).toBe('property-removed');
  });

  it('flags new required request fields as breaking', () => {
    const before = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } as const;
    const after = {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['id', 'email'],
    } as const;
    const diff = det.diff(before, after, SchemaDirection.Request);
    expect(diff.hasBreaking).toBe(true);
    expect(diff.changes.find((c) => c.path === 'email')!.reason).toBe('property-added');
  });

  it('treats added response fields as non-breaking', () => {
    const before = { type: 'object', properties: { id: { type: 'string' } } } as const;
    const after = { type: 'object', properties: { id: { type: 'string' }, extra: { type: 'number' } } } as const;
    const diff = det.diff(before, after, SchemaDirection.Response);
    expect(diff.hasBreaking).toBe(false);
  });

  it('flags enum narrowing on requests and enum widening on responses', () => {
    const before = { type: 'string', enum: ['a', 'b'] } as const;
    const narrower = { type: 'string', enum: ['a'] } as const;
    const wider = { type: 'string', enum: ['a', 'b', 'c'] } as const;
    expect(det.diff(before, narrower, SchemaDirection.Request).hasBreaking).toBe(true);
    expect(det.diff(before, narrower, SchemaDirection.Response).hasBreaking).toBe(false);
    expect(det.diff(before, wider, SchemaDirection.Response).hasBreaking).toBe(true);
    expect(det.diff(before, wider, SchemaDirection.Request).hasBreaking).toBe(false);
  });

  it('flags type changes and array item changes', () => {
    const before = { type: 'array', items: { type: 'string' } } as const;
    const after = { type: 'array', items: { type: 'number' } } as const;
    const diff = det.diff(before, after, SchemaDirection.Response);
    expect(diff.hasBreaking).toBe(true);
    expect(diff.changes.some((c) => c.reason === 'items-changed')).toBe(true);
  });

  it('flags closing additionalProperties on requests', () => {
    const before = { type: 'object', properties: { a: { type: 'string' } } } as const;
    const after = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false } as const;
    expect(det.isCompatible(before, after, SchemaDirection.Request)).toBe(false);
    expect(det.isCompatible(before, after, SchemaDirection.Response)).toBe(true);
  });
});

describe('VersionedRateLimiter', () => {
  let clock: TestClock;
  let limiter: VersionedRateLimiter;

  beforeEach(() => {
    clock = new TestClock(0);
    limiter = new VersionedRateLimiter(
      [
        { version: 'v1', maxCalls: 2, windowMs: 1000 },
        { version: 'v2', maxCalls: 5, windowMs: 1000 },
      ],
      { clock }
    );
  });

  it('enforces per-version quotas independently', () => {
    expect(limiter.check('c1', 'v1').allowed).toBe(true);
    expect(limiter.check('c1', 'v1').allowed).toBe(true);
    const blocked = limiter.check('c1', 'v1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAt).toBe(1000);
    // v2 unaffected
    expect(limiter.check('c1', 'v2').allowed).toBe(true);
  });

  it('slides the window — calls re-admitted after windowMs', () => {
    limiter.check('c1', 'v1');
    limiter.check('c1', 'v1');
    expect(limiter.check('c1', 'v1').allowed).toBe(false);
    clock.advance(1001);
    expect(limiter.check('c1', 'v1').allowed).toBe(true);
  });

  it('tracks clients independently on the same version', () => {
    limiter.check('a', 'v1');
    limiter.check('a', 'v1');
    expect(limiter.check('a', 'v1').allowed).toBe(false);
    expect(limiter.check('b', 'v1').allowed).toBe(true);
    expect(limiter.remaining('a', 'v1')).toBe(0);
    expect(limiter.remaining('b', 'v1')).toBe(1);
  });

  it('falls back to the default limit for unlisted versions', () => {
    limiter = new VersionedRateLimiter([], {
      clock,
      defaultLimit: { version: '*', maxCalls: 1, windowMs: 1000 },
    });
    expect(limiter.check('c', 'anything').allowed).toBe(true);
    expect(limiter.check('c', 'anything').allowed).toBe(false);
  });
});

describe('MigrationGuideGenerator', () => {
  it('generates required + optional steps personalised per client', () => {
    const clock = new TestClock(0);
    const usage = new VersionUsageTracker(clock);
    usage.record('acme', 'v1', '/users');
    const lifecycle = new VersionLifecycleManager({ clock });
    lifecycle.register('v1');
    lifecycle.activate('v1');
    lifecycle.scheduleTransition('v1', VersionPhase.Retired, clock.now() + 90 * DAY_MS);

    const gen = new MigrationGuideGenerator({ clock, lifecycle, usage });
    const oldSchema = [
      {
        endpoint: '/users',
        request: null,
        response: {
          type: 'object' as const,
          properties: { id: { type: 'string' as const }, name: { type: 'string' as const } },
          required: ['id', 'name'],
        },
      },
      {
        endpoint: '/orders',
        request: null,
        response: { type: 'object' as const, properties: { id: { type: 'string' as const } } },
      },
    ];
    const newSchema = [
      {
        endpoint: '/users',
        request: null,
        response: {
          type: 'object' as const,
          properties: { id: { type: 'string' as const } },
          required: ['id'],
        },
      },
      {
        endpoint: '/orders',
        request: null,
        response: { type: 'object' as const, properties: { id: { type: 'string' as const } } },
      },
    ];

    const guide = gen.generate('v1', 'v2', oldSchema, newSchema, 'acme');
    // Only /users is relevant to acme.
    expect(guide.steps.every((s) => s.endpoint === '/users')).toBe(true);
    expect(guide.steps.some((s) => s.required)).toBe(true);
    expect(guide.markdown.join('\n')).toContain('Personalised for client acme');
    expect(guide.markdown.join('\n')).toContain('retires in 90 day(s)');
    expect(guide.retireAt).toBe(clock.now() + 90 * DAY_MS);
  });

  it('reports no-change guides for backward-compatible upgrades', () => {
    const gen = new MigrationGuideGenerator();
    const ep = {
      endpoint: '/x',
      request: null,
      response: { type: 'object' as const, properties: { id: { type: 'string' as const } } },
    };
    const guide = gen.generate('v1', 'v2', [ep], [
      { ...ep, response: { type: 'object' as const, properties: { id: { type: 'string' as const }, extra: { type: 'number' as const } } } },
    ]);
    expect(guide.steps.every((s) => !s.required)).toBe(true);
  });
});
