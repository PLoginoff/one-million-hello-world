/**
 * Dashboard Composer
 *
 * Composes a dashboard definition — an ordered set of panels — into a
 * rendered `DashboardSnapshot` by evaluating each panel against the
 * sliding-window aggregator, the event tracker and the attribution
 * modeler.
 *
 * Panel kinds:
 *  - `counter`     — one aggregate value over the window (KPI tiles)
 *  - `sparkline`   — bucketed series for line/area charts
 *  - `top-n`       — heavy-hitter list (top pages, top referrers)
 *  - `event-count` — stored custom events grouped by name
 *  - `attribution` — channel credit table under a chosen model
 *
 * Rendering is pull-based and stateless: a snapshot is computed on
 * demand at `render()`, so a dashboard always reflects the live window
 * at call time. No timers, no subscriptions — the caller decides the
 * refresh cadence.
 *
 * Complexity: render() = O(P × panel cost); snapshots are immutable
 * value objects safe to hand to a UI layer.
 *
 * @module AnalyticsLayer/Engine2
 */

import type { SlidingWindowAggregator } from './SlidingWindowAggregator';
import type { EventTracker } from './EventTracker';
import type { AttributionModeler } from './AttributionModeler';
import type {
  AggregateKind,
  AnalyticsClock2,
  AttributionModel,
  CreditShare,
  SparklineBucket,
  TopNEntry,
} from './types';
import { SystemAnalyticsClock2 } from './types';

/* ------------------------------------------------------------------ */
/* Panel definitions                                                   */
/* ------------------------------------------------------------------ */

export interface CounterPanel {
  readonly kind: 'counter';
  readonly id: string;
  readonly title: string;
  readonly metric: string;
  readonly aggregate: AggregateKind;
}

export interface SparklinePanel {
  readonly kind: 'sparkline';
  readonly id: string;
  readonly title: string;
  readonly metric: string;
  readonly aggregate: AggregateKind;
  /** Number of buckets in the series. */
  readonly points: number;
}

export interface TopNPanel {
  readonly kind: 'top-n';
  readonly id: string;
  readonly title: string;
  /** Named dimension list fed via aggregator.hit(). */
  readonly list: string;
  readonly n: number;
}

export interface EventCountPanel {
  readonly kind: 'event-count';
  readonly id: string;
  readonly title: string;
  /** Restrict to these event names; undefined = all. */
  readonly names?: readonly string[];
  /** Optional lookback bound (ms); 0/undefined = all stored events. */
  readonly withinMs?: number;
}

export interface AttributionPanel {
  readonly kind: 'attribution';
  readonly id: string;
  readonly title: string;
  readonly model: AttributionModel;
}

export type DashboardPanel =
  | CounterPanel
  | SparklinePanel
  | TopNPanel
  | EventCountPanel
  | AttributionPanel;

export interface DashboardDefinition {
  readonly id: string;
  readonly title: string;
  readonly panels: readonly DashboardPanel[];
}

/* ------------------------------------------------------------------ */
/* Rendered snapshot                                                   */
/* ------------------------------------------------------------------ */

export interface RenderedCounter {
  readonly kind: 'counter';
  readonly id: string;
  readonly title: string;
  readonly value: number;
  readonly samples: number;
}

export interface RenderedSparkline {
  readonly kind: 'sparkline';
  readonly id: string;
  readonly title: string;
  readonly bucketMs: number;
  readonly buckets: readonly SparklineBucket[];
}

export interface RenderedTopN {
  readonly kind: 'top-n';
  readonly id: string;
  readonly title: string;
  readonly entries: readonly TopNEntry[];
  readonly total: number;
}

export interface RenderedEventCount {
  readonly kind: 'event-count';
  readonly id: string;
  readonly title: string;
  /** Event name → stored count, sorted by count desc. */
  readonly counts: ReadonlyArray<{ readonly name: string; readonly count: number }>;
}

export interface RenderedAttribution {
  readonly kind: 'attribution';
  readonly id: string;
  readonly title: string;
  readonly model: AttributionModel;
  readonly channels: readonly CreditShare[];
  readonly conversionsAttributed: number;
  readonly conversionsUnattributed: number;
}

export type RenderedPanel =
  | RenderedCounter
  | RenderedSparkline
  | RenderedTopN
  | RenderedEventCount
  | RenderedAttribution;

export interface DashboardSnapshot {
  readonly dashboardId: string;
  readonly title: string;
  readonly renderedAt: number;
  readonly panels: readonly RenderedPanel[];
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

export interface DashboardComposerOptions {
  readonly clock?: AnalyticsClock2;
}

export class DashboardComposer {
  private readonly clock: AnalyticsClock2;

  constructor(
    private readonly windows: SlidingWindowAggregator,
    private readonly tracker: EventTracker | null = null,
    private readonly attribution: AttributionModeler | null = null,
    options: DashboardComposerOptions = {}
  ) {
    this.clock = options.clock ?? new SystemAnalyticsClock2();
  }

  /**
   * Evaluate every panel in order against current state.
   * Panels that need a dependency the composer lacks render as
   * empty values rather than throwing — a dashboard with no tracker
   * still shows its counters.
   */
  render(def: DashboardDefinition): DashboardSnapshot {
    const now = this.clock.now();
    const panels: RenderedPanel[] = def.panels.map((p) => this.renderPanel(p, now));
    return {
      dashboardId: def.id,
      title: def.title,
      renderedAt: now,
      panels,
    };
  }

  private renderPanel(panel: DashboardPanel, now: number): RenderedPanel {
    switch (panel.kind) {
      case 'counter': {
        const a = this.windows.aggregate(panel.metric, panel.aggregate, now);
        return {
          kind: 'counter',
          id: panel.id,
          title: panel.title,
          value: a.value,
          samples: a.samples,
        };
      }
      case 'sparkline': {
        const s = this.windows.sparkline(panel.metric, panel.aggregate, panel.points, now);
        return {
          kind: 'sparkline',
          id: panel.id,
          title: panel.title,
          bucketMs: s.bucketMs,
          buckets: s.buckets,
        };
      }
      case 'top-n': {
        const t = this.windows.topN(panel.list, panel.n);
        return {
          kind: 'top-n',
          id: panel.id,
          title: panel.title,
          entries: t.entries,
          total: t.total,
        };
      }
      case 'event-count': {
        return this.renderEventCount(panel, now);
      }
      case 'attribution': {
        if (!this.attribution) {
          return {
            kind: 'attribution',
            id: panel.id,
            title: panel.title,
            model: panel.model,
            channels: [],
            conversionsAttributed: 0,
            conversionsUnattributed: 0,
          };
        }
        const r = this.attribution.attributeAll(panel.model);
        return {
          kind: 'attribution',
          id: panel.id,
          title: panel.title,
          model: panel.model,
          channels: r.channels,
          conversionsAttributed: r.conversionsAttributed,
          conversionsUnattributed: r.conversionsUnattributed,
        };
      }
    }
  }

  private renderEventCount(panel: EventCountPanel, now: number): RenderedEventCount {
    if (!this.tracker) {
      return { kind: 'event-count', id: panel.id, title: panel.title, counts: [] };
    }
    const fromMs = panel.withinMs !== undefined && panel.withinMs > 0 ? now - panel.withinMs : undefined;
    const events = this.tracker.query({ fromMs });
    const names = panel.names !== undefined ? new Set(panel.names) : undefined;
    const counts = new Map<string, number>();
    for (const e of events) {
      if (names && !names.has(e.name)) continue;
      counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    }
    const sorted = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
    return { kind: 'event-count', id: panel.id, title: panel.title, counts: sorted };
  }
}
