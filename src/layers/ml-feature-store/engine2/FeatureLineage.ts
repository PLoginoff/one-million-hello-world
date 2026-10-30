/**
 * Feature Lineage — pipeline → feature → model provenance graph.
 *
 * Records which pipeline runs produced which features, what inputs they
 * read, and which models consume which features. Answers the questions
 * incident response actually asks:
 *
 *   "which pipeline wrote feature X at time T?"   → producedBy lookup
 *   "what breaks if pipeline P is removed?"       → downstream closure
 *   "which features is model M reading?"          → consumer edges
 *
 * The graph is stored as two inverted maps (feature→runs, model→features)
 * plus an edge list for traversal. All edges are additive — lineage is
 * append-only history, never mutated.
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { FeatureNode, LineageEdge, PipelineRun } from './types';

export class FeatureLineageGraph {
  /** feature → producing runs (insertion order = chronological). */
  private readonly _producedBy = new Map<string, PipelineRun[]>();
  /** model → consumed features. */
  private readonly _consumers = new Map<string, Set<string>>();
  private readonly _runs = new Map<string, PipelineRun>();
  private readonly _edges: LineageEdge[] = [];

  /** Register a pipeline run and its produced features. */
  recordRun(run: PipelineRun): void {
    this._runs.set(run.runId, run);
    for (const input of run.inputs) {
      this._edges.push({ from: input, to: run.runId, kind: 'reads' });
    }
    for (const f of run.producedFeatures) {
      const list = this._producedBy.get(f) ?? [];
      list.push(run);
      this._producedBy.set(f, list);
      this._edges.push({ from: run.runId, to: f, kind: 'produces' });
    }
  }

  /** Declare that model `modelId` consumes `feature`. */
  recordConsumer(modelId: string, feature: string): void {
    let set = this._consumers.get(modelId);
    if (!set) {
      set = new Set();
      this._consumers.set(modelId, set);
    }
    if (!set.has(feature)) {
      set.add(feature);
      this._edges.push({ from: modelId, to: feature, kind: 'consumes' });
    }
  }

  /** Provenance view of one feature. */
  feature(feature: string): FeatureNode {
    const runs = [...(this._producedBy.get(feature) ?? [])].reverse();
    const consumers = [...this._consumers.entries()]
      .filter(([, set]) => set.has(feature))
      .map(([m]) => m);
    return { feature, producedBy: runs, consumers };
  }

  /** Which runs most recently produced this feature (or undefined). */
  lastProducer(feature: string): PipelineRun | undefined {
    const list = this._producedBy.get(feature);
    return list?.[list.length - 1];
  }

  /** All features produced by a pipeline (across runs). */
  featuresOfPipeline(pipelineId: string): string[] {
    const out = new Set<string>();
    for (const run of this._runs.values()) {
      if (run.pipelineId === pipelineId) {
        for (const f of run.producedFeatures) out.add(f);
      }
    }
    return [...out];
  }

  /** All models depending on a feature — the blast radius of a bad run. */
  impactedModels(feature: string): string[] {
    return [...this.feature(feature).consumers] as string[];
  }

  /**
   * Downstream closure of a pipeline: every feature it produces plus
   * every model consuming any of them — the "what breaks" answer.
   */
  downstreamOf(pipelineId: string): { features: string[]; models: string[] } {
    const features = [...this.featuresOfPipeline(pipelineId)];
    const models = new Set<string>();
    for (const f of features) {
      for (const m of this.impactedModels(f)) models.add(m);
    }
    return { features, models: [...models].sort() };
  }

  /**
   * Upstream inputs a feature transitively depends on: walk back through
   * the producing pipeline's inputs and (recursively) any inputs that are
   * themselves features.
   */
  upstreamOf(feature: string): string[] {
    const seen = new Set<string>();
    const out = new Set<string>();
    const visit = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const run of this._producedBy.get(f) ?? []) {
        for (const input of run.inputs) {
          out.add(input);
          if (this._producedBy.has(input)) visit(input); // input is itself a feature
        }
      }
    };
    visit(feature);
    out.delete(feature);
    return [...out].sort();
  }

  /** The raw edge list for visualization/export. */
  edges(): ReadonlyArray<LineageEdge> {
    return this._edges;
  }

  runs(): ReadonlyArray<PipelineRun> {
    return [...this._runs.values()];
  }
}
