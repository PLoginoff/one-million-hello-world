/**
 * SIEM Correlation Engine
 *
 * Detects multi-step attack patterns by tracking event sequences within
 * sliding time windows. Classic use case: "N failed logins followed by
 * a successful login from the same source IP within 5 minutes" — a
 * possible brute-force-success.
 *
 * Model:
 *   - A `CorrelationRule` is a sequence of `StepMatcher`s (predicates
 *     over normalized events).
 *   - Each event can start a new "candidate" sequence at step 0, and/or
 *     advance existing candidates to the next step.
 *   - Candidates expire when `windowMs` elapses from their start.
 *   - `withinMs` on a step constrains the gap to the *previous* matched
 *     event (defaults to the whole window).
 *
 * Complexity: O(E * C) per event where E = live candidates, C = candidate
 * check cost. Candidates are grouped by rule; expiries are lazy (checked
 * on access), so idle rules cost nothing between events.
 *
 * @module SiemLayer/Engine
 */

import { NormalizedEvent } from './EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';

/** A predicate over one event. Use the builder helpers for common shapes. */
export type StepMatcher = (e: NormalizedEvent) => boolean;

export interface CorrelationStep {
  readonly name: string;
  readonly match: StepMatcher;
  /** Max ms between this step's match and the previous step's match. */
  readonly withinMs?: number;
  /** How many matches this step needs before advancing (e.g. N failures). */
  readonly count?: number;
}

export interface CorrelationRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Total sequence lifetime (ms). */
  readonly windowMs: number;
  readonly steps: ReadonlyArray<CorrelationStep>;
  /** Severity name assigned to a fired alert ('low'|'medium'|'high'|'critical'). */
  readonly severity: string;
  /** Optional: events that reset a candidate (e.g. password-change clears failures). */
  readonly resetOn?: StepMatcher;
}

/** A partially-matched sequence. */
interface Candidate {
  ruleId: string;
  startedMs: number;
  stepIndex: number;
  /** Match count toward the current step's `count` requirement. */
  stepCount: number;
  lastMatchMs: number;
  matchedEvents: NormalizedEvent[];
}

export interface CorrelationMatch {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: string;
  readonly startedMs: number;
  readonly completedMs: number;
  readonly events: ReadonlyArray<NormalizedEvent>;
  /** Grouping key for alert dedup — defaults built from user+sourceIp. */
  readonly dedupKey: string;
}

// ---------- Step matcher builders ----------

export const match = {
  action(a: string): StepMatcher {
    return (e) => e.action === a;
  },
  outcome(o: NormalizedEvent['outcome']): StepMatcher {
    return (e) => e.outcome === o;
  },
  user(u: string): StepMatcher {
    return (e) => e.user === u;
  },
  fieldEq(key: string, value: string): StepMatcher {
    return (e) => e.fields[key] === value;
  },
  severityAtLeast(min: string): StepMatcher {
    const rank = (s: string) =>
      ['debug', 'info', 'notice', 'warning', 'err', 'crit', 'alert', 'emerg'].indexOf(s);
    return (e) => rank(e.severity) >= rank(min);
  },
  and(...ms: StepMatcher[]): StepMatcher {
    return (e) => ms.every((m) => m(e));
  },
  or(...ms: StepMatcher[]): StepMatcher {
    return (e) => ms.some((m) => m(e));
  },
  not(m: StepMatcher): StepMatcher {
    return (e) => !m(e);
  },
};

/** Build the canonical "N failures then success" brute-force rule. */
export function bruteForceRule(opts: {
  failureCount: number;
  windowMs: number;
  severity?: string;
}): CorrelationRule {
  const failure = match.and(match.action('login'), match.outcome('failure'));
  return {
    id: 'brute-force-login',
    name: 'Brute force login',
    description: `${opts.failureCount} failed logins followed by success`,
    windowMs: opts.windowMs,
    severity: opts.severity ?? 'high',
    steps: [
      { name: 'failures', match: failure, count: opts.failureCount },
      {
        name: 'success',
        match: match.and(match.action('login'), match.outcome('success')),
      },
    ],
  };
}

export interface CorrelationStats {
  eventsProcessed: number;
  candidatesStarted: number;
  candidatesExpired: number;
  matches: number;
}

export class CorrelationEngine {
  private readonly _rules: Map<string, CorrelationRule> = new Map();
  private readonly _candidates: Map<string, Candidate[]> = new Map();
  private readonly _clock: IClock;
  private readonly _matches: CorrelationMatch[] = [];
  private _stats: CorrelationStats = {
    eventsProcessed: 0,
    candidatesStarted: 0,
    candidatesExpired: 0,
    matches: 0,
  };

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  addRule(rule: CorrelationRule): void {
    this._rules.set(rule.id, rule);
    this._candidates.set(rule.id, []);
  }

  removeRule(ruleId: string): void {
    this._rules.delete(ruleId);
    this._candidates.delete(ruleId);
  }

  /** Feed one event; returns any matches that just completed. */
  ingest(event: NormalizedEvent): CorrelationMatch[] {
    this._stats.eventsProcessed++;
    const fired: CorrelationMatch[] = [];

    for (const [ruleId, rule] of this._rules) {
      const candidates = this._candidates.get(ruleId);
      if (!candidates) continue;

      // 1. Expire stale candidates.
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (event.timestampMs - candidates[i].startedMs > rule.windowMs) {
          candidates.splice(i, 1);
          this._stats.candidatesExpired++;
        }
      }

      // 2. Reset candidates if the rule says so.
      if (rule.resetOn?.(event)) {
        for (const c of candidates) {
          if (this._sharesGroup(c, event)) {
            c.stepIndex = 0;
            c.stepCount = 0;
            c.matchedEvents.length = 0;
            c.startedMs = event.timestampMs;
          }
        }
      }

      // 3. Try to advance existing candidates (same correlation group).
      for (const c of candidates) {
        this._tryAdvance(rule, c, event, fired);
      }

      // 4. Maybe start a new candidate at step 0.
      if (this._matchesStep(rule.steps[0], event)) {
        const c: Candidate = {
          ruleId,
          startedMs: event.timestampMs,
          stepIndex: 0,
          stepCount: 0,
          lastMatchMs: event.timestampMs,
          matchedEvents: [],
        };
        candidates.push(c);
        this._stats.candidatesStarted++;
        this._applyMatch(rule, c, event, fired);
      }
    }

    return fired;
  }

  private _tryAdvance(
    rule: CorrelationRule,
    c: Candidate,
    event: NormalizedEvent,
    fired: CorrelationMatch[]
  ): void {
    if (!this._sharesGroup(c, event)) return;
    const step = rule.steps[c.stepIndex];
    if (!step) return;
    if (step.withinMs !== undefined && event.timestampMs - c.lastMatchMs > step.withinMs) {
      // Gap too long — reset this candidate's progress (don't remove;
      // the window expiry handles lifecycle).
      c.stepIndex = 0;
      c.stepCount = 0;
      c.matchedEvents.length = 0;
      c.startedMs = event.timestampMs;
      // The event might itself satisfy step 0.
      if (this._matchesStep(rule.steps[0], event)) {
        this._applyMatch(rule, c, event, fired);
      }
      return;
    }
    if (this._matchesStep(step, event)) {
      this._applyMatch(rule, c, event, fired);
    }
  }

  private _applyMatch(
    rule: CorrelationRule,
    c: Candidate,
    event: NormalizedEvent,
    fired: CorrelationMatch[]
  ): void {
    const step = rule.steps[c.stepIndex];
    if (!step) return;
    c.stepCount++;
    c.lastMatchMs = event.timestampMs;
    c.matchedEvents.push(event);
    const needed = step.count ?? 1;
    if (c.stepCount >= needed) {
      c.stepIndex++;
      c.stepCount = 0;
      if (c.stepIndex >= rule.steps.length) {
        // Sequence complete.
        const m: CorrelationMatch = {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          startedMs: c.startedMs,
          completedMs: event.timestampMs,
          events: [...c.matchedEvents],
          dedupKey: this._dedupKey(rule, c.matchedEvents),
        };
        fired.push(m);
        this._matches.push(m);
        this._stats.matches++;
        // Remove the completed candidate.
        const arr = this._candidates.get(rule.id);
        if (arr) {
          const idx = arr.indexOf(c);
          if (idx >= 0) arr.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Correlation grouping: candidates only advance on events that share
   * the "key" of the already-matched events — source IP AND user when
   * present. This keeps a multi-step sequence tied to one attacker/user
   * rather than glomming unrelated events.
   */
  private _sharesGroup(c: Candidate, event: NormalizedEvent): boolean {
    const first = c.matchedEvents[0];
    if (!first) return true;
    if (first.sourceIp && event.sourceIp && first.sourceIp !== event.sourceIp) return false;
    if (first.user && event.user && first.user !== event.user) return false;
    return true;
  }

  private _matchesStep(step: CorrelationStep | undefined, event: NormalizedEvent): boolean {
    return step !== undefined && step.match(event);
  }

  private _dedupKey(rule: CorrelationRule, events: ReadonlyArray<NormalizedEvent>): string {
    const user = events.find((e) => e.user)?.user ?? '-';
    const ip = events.find((e) => e.sourceIp)?.sourceIp ?? '-';
    return `${rule.id}:${user}:${ip}`;
  }

  pendingCandidates(): number {
    let n = 0;
    for (const c of this._candidates.values()) n += c.length;
    return n;
  }

  allMatches(): ReadonlyArray<CorrelationMatch> {
    return this._matches;
  }

  getStats(): CorrelationStats {
    return { ...this._stats };
  }
}
