/**
 * WAF Engine2 — Shared Types
 *
 * Second-generation WAF primitives: learning mode that observes traffic
 * and suggests rules, rate-based rules, geo-blocking by country code,
 * a small expression DSL for custom rules, and false-positive tracking
 * with per-rule path allowlists.
 *
 * Self-contained request model (compatible shape with the v1 HttpRequest
 * but re-declared so engine2 compiles standalone).
 *
 * @module WafLayer/Engine2
 */

/** Injectable clock for rate windows and learning observation TTLs. */
export interface WafClock2 {
  now(): number;
}

export class SystemWafClock2 implements WafClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualWafClock2 implements WafClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** Inbound request as seen by engine2 rules. */
export interface WafRequest2 {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly clientIp: string;
  /** ISO-3166 alpha-2 country code if upstream geo-lookup resolved it. */
  readonly country?: string;
}

/** Decision returned by the engine2 evaluator. */
export type WafVerdict2 =
  | { readonly action: 'allow'; readonly annotations: readonly string[] }
  | { readonly action: 'log'; readonly ruleId: string; readonly reason: string }
  | { readonly action: 'block'; readonly ruleId: string; readonly reason: string; readonly score: number };

/** How a suggested/compiled rule acts on a match. */
export type Rule2Action = 'log' | 'block' | 'captcha';
