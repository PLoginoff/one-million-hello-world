/**
 * Kill Chain Tracker — multi-stage attack progression per entity.
 *
 * Distinct from `CorrelationEngine` (which fires when a fixed step
 * sequence completes): the tracker maintains *progression state* per
 * entity (sourceIp or user) across the standard kill-chain stages and
 * reports how far each entity advanced — a partial chain is itself a
 * signal even when it never completes.
 *
 * Stages (Lockheed model, simplified to event actions):
 *   recon → delivery → exploitation → installation → c2 → exfiltration
 *
 * An entity "reaches" a stage when it produces an event whose action
 * maps to it. Forward-only progression: regressions don't lower the
 * watermark, but each stage hit is timestamped for dwell-time analysis.
 *
 * @module SiemLayer/Engine2
 */

import { NormalizedEvent } from '../engine/EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type KillChainStage =
  | 'recon'
  | 'delivery'
  | 'exploitation'
  | 'installation'
  | 'c2'
  | 'exfiltration';

export const STAGE_ORDER: ReadonlyArray<KillChainStage> = [
  'recon',
  'delivery',
  'exploitation',
  'installation',
  'c2',
  'exfiltration',
];

/** Action → stage mapping; extendable per deployment. */
export const DEFAULT_ACTION_STAGE: Readonly<Record<string, KillChainStage>> = {
  'port-scan': 'recon',
  'dns-enum': 'recon',
  'banner-grab': 'recon',
  'phishing-mail': 'delivery',
  'drive-by': 'delivery',
  'exploit': 'exploitation',
  'privesc': 'exploitation',
  'malware-install': 'installation',
  'persistence': 'installation',
  'beacon': 'c2',
  'dns-tunnel': 'c2',
  'exfil': 'exfiltration',
  'data-upload': 'exfiltration',
};

export interface EntityProgress {
  readonly entity: string;
  /** Highest stage index reached (-1 = none). */
  readonly watermark: number;
  readonly watermarkStage?: KillChainStage;
  /** stage → first-hit timestamp. */
  readonly stageHits: Readonly<Record<string, number>>;
  /** Events seen on this entity. */
  readonly eventCount: number;
  /** Longest dwell between consecutive stage hits (ms). */
  readonly maxDwellMs?: number;
  readonly firstSeenMs: number;
  readonly lastSeenMs: number;
}

interface Runtime {
  watermark: number;
  stageHits: Map<KillChainStage, number>;
  count: number;
  firstMs: number;
  lastMs: number;
}

export class KillChainTracker {
  private readonly _clock: IClock;
  private readonly _actionStage: Readonly<Record<string, KillChainStage>>;
  private readonly _entities = new Map<string, Runtime>();

  constructor(
    actionStage: Readonly<Record<string, KillChainStage>> = DEFAULT_ACTION_STAGE,
    clock: IClock = new SystemClock(),
  ) {
    this._clock = clock;
    this._actionStage = actionStage;
  }

  /**
   * Record an event; the entity key is `sourceIp ?? user ?? '(anon)'`.
   * Returns the progression snapshot when the event advanced a stage,
   * otherwise undefined — hot path stays cheap.
   */
  ingest(e: NormalizedEvent): EntityProgress | undefined {
    const entity = e.sourceIp ?? e.user ?? '(anon)';
    let rt = this._entities.get(entity);
    if (!rt) {
      rt = {
        watermark: -1,
        stageHits: new Map(),
        count: 0,
        firstMs: e.timestampMs,
        lastMs: e.timestampMs,
      };
      this._entities.set(entity, rt);
    }
    rt.count += 1;
    rt.lastMs = Math.max(rt.lastMs, e.timestampMs);
    rt.firstMs = Math.min(rt.firstMs, e.timestampMs);

    const stage = e.action ? this._actionStage[e.action] : undefined;
    if (!stage) return undefined;
    const idx = STAGE_ORDER.indexOf(stage);
    const isNew = !rt.stageHits.has(stage);
    if (isNew) rt.stageHits.set(stage, e.timestampMs);
    if (idx > rt.watermark) rt.watermark = idx;
    return isNew || idx === rt.watermark ? this._progress(entity, rt) : undefined;
  }

  /** Progression snapshot for one entity. */
  progress(entity: string): EntityProgress | undefined {
    const rt = this._entities.get(entity);
    return rt ? this._progress(entity, rt) : undefined;
  }

  /**
   * Entities at-or-past `minStage` — the watchlist a SOC would page on
   * (e.g. anyone who reached 'c2' or deeper).
   */
  atLeast(stage: KillChainStage): EntityProgress[] {
    const min = STAGE_ORDER.indexOf(stage);
    const out: EntityProgress[] = [];
    for (const [entity, rt] of this._entities) {
      if (rt.watermark >= min) out.push(this._progress(entity, rt));
    }
    out.sort((a, b) => b.watermark - a.watermark);
    return out;
  }

  private _progress(entity: string, rt: Runtime): EntityProgress {
    const hits: Record<string, number> = {};
    for (const [k, v] of rt.stageHits) hits[k] = v;
    // Max dwell between consecutive *hit* stages.
    const orderedHits = [...rt.stageHits.values()].sort((a, b) => a - b);
    let maxDwell: number | undefined;
    for (let i = 1; i < orderedHits.length; i++) {
      const d = orderedHits[i] - orderedHits[i - 1];
      if (maxDwell === undefined || d > maxDwell) maxDwell = d;
    }
    return {
      entity,
      watermark: rt.watermark,
      watermarkStage: rt.watermark >= 0 ? STAGE_ORDER[rt.watermark] : undefined,
      stageHits: hits,
      eventCount: rt.count,
      maxDwellMs: maxDwell,
      firstSeenMs: rt.firstMs,
      lastSeenMs: rt.lastMs,
    };
  }
}
