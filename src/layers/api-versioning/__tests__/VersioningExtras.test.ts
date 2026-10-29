/**
 * API Versioning — MigrationGuide + SunsetSchedule + Compliance tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  MigrationGuideRegistry,
  SunsetSchedule,
  VersionCompliance,
  VersionMatrix,
  VersionStatus,
} from '../negotiation';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

describe('MigrationGuideRegistry', () => {
  it('composes multi-hop migration paths via BFS', () => {
    const reg = new MigrationGuideRegistry();
    reg.register({ from: '1.0.0', to: '2.0.0', title: 'v1→v2', effort: 'moderate', changes: [{ kind: 'field-renamed', description: 'user.name → user.fullName', remedy: 'send fullName' }] });
    reg.register({ from: '2.0.0', to: '3.0.0', title: 'v2→v3', effort: 'trivial', changes: [{ kind: 'feature-added', description: 'pagination' }] });

    const p = reg.path('1.0.0', '3.0.0');
    expect(p).toBeDefined();
    expect(p!.hops).toEqual(['1.0.0', '2.0.0', '3.0.0']);
    expect(p!.guides.length).toBe(2);
    expect(p!.effort).toBe('moderate');
    expect(p!.changes.length).toBe(2);
    expect(p!.changes[0].hopFrom).toBe('1.0.0');
    expect(p!.breaking).toBe(true); // field-renamed counts? — no, breaking/removed/type do
  });

  it('backward guides rejected', () => {
    const reg = new MigrationGuideRegistry();
    expect(() => reg.register({ from: '2.0.0', to: '1.0.0', title: 'backward' })).toThrow();
  });

  it('unreachable destination → undefined', () => {
    const reg = new MigrationGuideRegistry();
    reg.register({ from: '1.0.0', to: '2.0.0', title: 'x' });
    expect(reg.path('1.0.0', '9.9.9')).toBeUndefined();
    expect(reg.canReach('2.0.0')).toEqual(['1.0.0']);
  });
});

describe('SunsetSchedule', () => {
  it('orders upcoming sunsets, filters by window', () => {
    const m = new VersionMatrix(() => T0);
    m.register({ version: '1.0.0', status: VersionStatus.DEPRECATED, sunsetAt: T0 + 10 * DAY, successor: '3.0.0' });
    m.register({ version: '2.0.0', status: VersionStatus.DEPRECATED, sunsetAt: T0 + 60 * DAY });
    m.register({ version: '3.0.0', status: VersionStatus.SUPPORTED });
    const sched = new SunsetSchedule(m, () => T0);

    const all = sched.upcoming();
    expect(all.map((u) => u.version)).toEqual(['1.0.0', '2.0.0']);
    expect(all[0].daysUntil).toBe(10);
    expect(sched.within(30).map((u) => u.version)).toEqual(['1.0.0']);
    expect(sched.next()?.version).toBe('1.0.0');
  });
});

describe('VersionCompliance', () => {
  it('flags deprecated-without-successor and beta-without-sunset', () => {
    const m = new VersionMatrix(() => T0);
    m.register({ version: '1.0.0', status: VersionStatus.DEPRECATED }); // no successor
    m.register({ version: '3.0.0-beta.1', status: VersionStatus.BETA }); // no sunset
    m.register({ version: '2.0.0', status: VersionStatus.SUPPORTED });
    const violations = new VersionCompliance().check(m);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('deprecated-needs-successor');
    expect(rules).toContain('beta-needs-sunset');
    expect(violations.find((v) => v.rule === 'deprecated-needs-successor')?.severity).toBe('error');
  });

  it('warns on too many supported majors', () => {
    const m = new VersionMatrix(() => T0);
    for (const v of ['1.0.0', '2.0.0', '3.0.0', '4.0.0']) {
      m.register({ version: v, status: VersionStatus.SUPPORTED });
    }
    const violations = new VersionCompliance().check(m);
    expect(violations.some((v) => v.rule === 'supported-count')).toBe(true);
  });
});
