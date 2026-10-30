/**
 * Migration Guide Generator
 *
 * Produces a structured migration guide for moving clients off an old
 * version, combining:
 * - lifecycle state (when the old version sunsets/retires),
 * - the per-endpoint schema diffs from {@link BreakingChangeDetector}
 *   rendered as actionable steps,
 * - per-client usage (which endpoints the client actually calls),
 *   so each client gets a guide containing only the sections that
 *   affect them.
 *
 * The guide is emitted as Markdown-flavoured lines plus a machine-
 * readable step list — generators in real pipelines usually feed both
 * docs sites and email/CLI channels.
 *
 * @module ApiVersioningLayer/Engine2
 */

import {
  ChangeKind,
  DAY_MS,
  IClock,
  SchemaDiff,
  SchemaDirection,
  SchemaNode,
  SystemClock,
  VersionPhase,
} from './types';
import { BreakingChangeDetector } from './BreakingChangeDetector';
import { VersionLifecycleManager } from './VersionLifecycleManager';
import { VersionUsageTracker } from './VersionUsageTracker';

/** One endpoint's request+response schemas for a given version. */
export interface EndpointSchema {
  endpoint: string;
  request: SchemaNode | null;
  response: SchemaNode | null;
}

export interface MigrationStep {
  endpoint: string;
  /** e.g. "request", "response". */
  side: 'request' | 'response';
  /** Human-readable instruction. */
  instruction: string;
  /** True when the change is breaking and MUST be handled. */
  required: boolean;
}

export interface MigrationGuide {
  fromVersion: string;
  toVersion: string;
  /** Client the guide was personalised for, or null for a generic guide. */
  clientId: string | null;
  generatedAt: number;
  /** Epoch ms when the old version is scheduled to retire, if known. */
  retireAt: number | null;
  steps: MigrationStep[];
  /** Rendered Markdown lines. */
  markdown: string[];
}

export class MigrationGuideGenerator {
  private readonly _lifecycle: VersionLifecycleManager | null;
  private readonly _usage: VersionUsageTracker | null;
  private readonly _detector: BreakingChangeDetector;
  private readonly _clock: IClock;

  constructor(options: {
    clock?: IClock;
    lifecycle?: VersionLifecycleManager;
    usage?: VersionUsageTracker;
  } = {}) {
    this._lifecycle = options.lifecycle ?? null;
    this._usage = options.usage ?? null;
    this._detector = new BreakingChangeDetector();
    this._clock = options.clock ?? new SystemClock();
  }

  /**
   * Generate a guide migrating `fromVersion` -> `toVersion`.
   *
   * @param oldSchema  per-endpoint schemas of the old version
   * @param newSchema  per-endpoint schemas of the new version
   * @param clientId   optional — when given, only endpoints the client
   *                   actually calls (per the usage tracker) are included
   *                   and the guide header names them.
   */
  generate(
    fromVersion: string,
    toVersion: string,
    oldSchema: readonly EndpointSchema[],
    newSchema: readonly EndpointSchema[],
    clientId: string | null = null
  ): MigrationGuide {
    const steps: MigrationStep[] = [];
    const newByEndpoint = new Map(newSchema.map((e) => [e.endpoint, e]));

    // Which endpoints to include: all of the old version's, or just the
    // ones this client actually calls.
    let relevant = oldSchema;
    if (clientId && this._usage) {
      const used = new Set(
        this._usage.endpointsOf(clientId, fromVersion).map((e) => e.endpoint)
      );
      relevant = oldSchema.filter((e) => used.has(e.endpoint));
    }

    for (const oldEp of relevant) {
      const newEp = newByEndpoint.get(oldEp.endpoint);
      if (!newEp) {
        steps.push({
          endpoint: oldEp.endpoint,
          side: 'request',
          instruction: `Endpoint ${oldEp.endpoint} does not exist in ${toVersion} — find a replacement or migrate to the equivalent route.`,
          required: true,
        });
        continue;
      }
      this._addDiffSteps(steps, oldEp, newEp, 'request');
      this._addDiffSteps(steps, oldEp, newEp, 'response');
    }

    // Lifecycle timing.
    let retireAt: number | null = null;
    if (this._lifecycle) {
      const lc = this._lifecycle.lifecycle(fromVersion);
      if (lc) {
        if (lc.nextPhase === VersionPhase.Retired && lc.nextTransitionAt !== null) {
          retireAt = lc.nextTransitionAt;
        } else if (lc.phase === VersionPhase.Retired) {
          retireAt = lc.phaseSince;
        }
      }
    }

    return {
      fromVersion,
      toVersion,
      clientId,
      generatedAt: this._clock.now(),
      retireAt,
      steps,
      markdown: this._render(fromVersion, toVersion, clientId, retireAt, steps),
    };
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private _addDiffSteps(
    out: MigrationStep[],
    oldEp: EndpointSchema,
    newEp: EndpointSchema,
    side: 'request' | 'response'
  ): void {
    const b = side === 'request' ? oldEp.request : oldEp.response;
    const a = side === 'request' ? newEp.request : newEp.response;
    if (!b && !a) return;
    if (!b && a) {
      out.push({
        endpoint: oldEp.endpoint,
        side,
        instruction: `${oldEp.endpoint} now has a ${side} schema in the new version — review it.`,
        required: false,
      });
      return;
    }
    if (b && !a) {
      out.push({
        endpoint: oldEp.endpoint,
        side,
        instruction: `${oldEp.endpoint} no longer accepts a ${side} body.`,
        required: side === 'request',
      });
      return;
    }
    const dir = side === 'request' ? SchemaDirection.Request : SchemaDirection.Response;
    const diff: SchemaDiff = this._detector.diff(b!, a!, dir);
    for (const c of diff.changes) {
      out.push({
        endpoint: oldEp.endpoint,
        side,
        instruction: `${side} ${c.path || '(root)'}: ${c.reason}${c.before ? ` (${c.before} -> ${c.after ?? '—'})` : ''}`,
        required: c.kind === ChangeKind.Breaking,
      });
    }
  }

  private _render(
    from: string,
    to: string,
    clientId: string | null,
    retireAt: number | null,
    steps: MigrationStep[]
  ): string[] {
    const lines: string[] = [];
    lines.push(`# Migration guide: ${from} -> ${to}`);
    if (clientId) lines.push(`_Personalised for client ${clientId}_`);
    if (retireAt !== null) {
      const days = Math.max(0, Math.ceil((retireAt - this._clock.now()) / DAY_MS));
      lines.push(`**${from} retires in ${days} day(s).**`);
    }
    lines.push('');
    const required = steps.filter((s) => s.required);
    const optional = steps.filter((s) => !s.required);
    if (required.length > 0) {
      lines.push('## Required changes');
      for (const s of required) lines.push(`- [${s.endpoint}] (${s.side}) ${s.instruction}`);
      lines.push('');
    }
    if (optional.length > 0) {
      lines.push('## Optional / informational');
      for (const s of optional) lines.push(`- [${s.endpoint}] (${s.side}) ${s.instruction}`);
    }
    if (steps.length === 0) lines.push('No changes required — the new version is backward compatible for you.');
    return lines;
  }
}
