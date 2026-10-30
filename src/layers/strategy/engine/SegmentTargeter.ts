/**
 * SegmentTargeter — cohort-based flag targeting ("enable for admins
 * in EU on v2+").
 *
 * A segment is a list of `Condition`s over a subject's attributes;
 * a subject is *in* the segment when every condition holds (AND —
 * the conventional semantics for targeting rules). Conditions support
 * the operators real targeting systems use:
 *
 *   eq / ne / in / notIn       — scalar membership
 *   lt / le / gt / ge          — ordered comparison (numbers/dates)
 *   contains / startsWith / endsWith — string matching
 *   regex                     — full pattern
 *   percent                   — hash-based sticky percentage ("X% of users")
 *
 * Evaluation is pure — no I/O. The subject supplies attributes as a
 * flat `Record<string, unknown>`; `percent` conditions hash
 * `flag:subjectId` for stickiness.
 *
 * @module StrategyLayer/Engine
 */

import { fnv1a32 } from './types';

export type ConditionOp =
  | 'eq' | 'ne' | 'in' | 'notIn'
  | 'lt' | 'le' | 'gt' | 'ge'
  | 'contains' | 'startsWith' | 'endsWith'
  | 'regex'
  | 'percent';

export interface Condition {
  /** Subject attribute to test (e.g. 'country', 'plan', 'version'). */
  attribute: string;
  op: ConditionOp;
  /** Comparison value(s). For 'in'/'notIn' pass an array; 'percent' a 0..100 number. */
  value: unknown;
}

export interface Segment {
  name: string;
  conditions: readonly Condition[];
}

export interface EvalContext {
  subjectId: string;
  attributes: Record<string, unknown>;
  /** Flag name — makes `percent` conditions flag-specific. */
  flag?: string;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/** Evaluate one condition against the context. */
function evalCondition(cond: Condition, ctx: EvalContext): boolean {
  const attr = ctx.attributes[cond.attribute];
  switch (cond.op) {
    case 'eq':
      return attr === cond.value;
    case 'ne':
      return attr !== cond.value;
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(attr);
    case 'notIn':
      return Array.isArray(cond.value) && !cond.value.includes(attr);
    case 'lt': case 'le': case 'gt': case 'ge': {
      const a = asNumber(attr);
      const b = asNumber(cond.value);
      if (a === null || b === null) return false;
      if (cond.op === 'lt') return a < b;
      if (cond.op === 'le') return a <= b;
      if (cond.op === 'gt') return a > b;
      return a >= b;
    }
    case 'contains': case 'startsWith': case 'endsWith': {
      const s = asString(attr);
      const needle = asString(cond.value);
      if (s === null || needle === null) return false;
      if (cond.op === 'contains') return s.includes(needle);
      if (cond.op === 'startsWith') return s.startsWith(needle);
      return s.endsWith(needle);
    }
    case 'regex': {
      const s = asString(attr);
      const pattern = asString(cond.value);
      if (s === null || pattern === null) return false;
      try {
        return new RegExp(pattern).test(s);
      } catch {
        return false;
      }
    }
    case 'percent': {
      const pct = asNumber(cond.value);
      if (pct === null || pct < 0 || pct > 100) return false;
      const bucket = (fnv1a32(`${ctx.flag ?? 'flag'}:${ctx.subjectId}`) % 10_000) / 100;
      return bucket < pct;
    }
  }
}

export class SegmentTargeter {
  private readonly _segments = new Map<string, Segment>();

  /** Register a named segment (replaceable). */
  define(segment: Segment): void {
    this._segments.set(segment.name, segment);
  }

  remove(name: string): boolean {
    return this._segments.delete(name);
  }

  /** Is `ctx` inside `segmentName`? Unknown segments → false. */
  matches(segmentName: string, ctx: EvalContext): boolean {
    const seg = this._segments.get(segmentName);
    if (!seg) return false;
    return seg.conditions.every((c) => evalCondition(c, ctx));
  }

  /** All segments the context belongs to. */
  matchingSegments(ctx: EvalContext): string[] {
    const out: string[] = [];
    for (const [name, seg] of this._segments) {
      if (seg.conditions.every((c) => evalCondition(c, ctx))) out.push(name);
    }
    return out;
  }

  segments(): string[] {
    return Array.from(this._segments.keys());
  }
}
