/**
 * Rightsizing Recommendation Engine
 *
 * Suggests a cheaper instance size when observed utilization (p95) fits
 * comfortably inside a smaller catalog entry.
 *
 * Algorithm: for each resource, compute p95 utilization from the idle
 * engine's windowed samples (or accept it directly). Walk the size
 * catalog — sorted ascending by cost — and find the smallest entry whose
 * capacity, scaled to the current size's capacity, keeps headroom above
 * `targetUtilization`. The projected p95 load on a candidate size is:
 *
 *   projected = observedP95 × (currentCapacity / candidateCapacity)
 *
 * and a candidate is safe when projected ≤ targetUtilization. Savings is
 * simply current - candidate hourly cost; a recommendation is only
 * emitted when savings > 0 and the candidate differs from current.
 *
 * @module CostOptimizationLayer/Engines
 */

import { RightsizeRecommendation, SizeCatalogEntry } from './types';

export interface RightsizingConfig {
  /** Max acceptable projected utilization on the new size (percent). */
  targetUtilization: number;
}

export class RightsizingEngine {
  /** size -> catalog entry; catalog kept sorted ascending by cost. */
  private _catalog: SizeCatalogEntry[];
  private readonly _config: RightsizingConfig;

  constructor(config: Partial<RightsizingConfig> = {}) {
    this._catalog = [];
    this._config = { targetUtilization: 70, ...config };
  }

  /** Register a size in the catalog. */
  addSize(entry: SizeCatalogEntry): void {
    this._catalog = this._catalog.filter((e) => e.size !== entry.size);
    this._catalog.push({ ...entry });
    this._catalog.sort((a, b) => a.hourlyCostCents - b.hourlyCostCents);
  }

  getCatalog(): ReadonlyArray<SizeCatalogEntry> {
    return this._catalog;
  }

  /**
   * Recommend a size for one resource.
   *
   * @param resourceId resource identifier (for the report)
   * @param currentSize current catalog size — must exist in catalog
   * @param observedP95 p95 utilization percent of the current size
   * @returns recommendation, or null when already right-sized / unknown size
   */
  recommend(
    resourceId: string,
    currentSize: string,
    observedP95: number
  ): RightsizeRecommendation | null {
    const current = this._catalog.find((e) => e.size === currentSize);
    if (!current) return null;

    for (const candidate of this._catalog) {
      if (candidate.hourlyCostCents >= current.hourlyCostCents) break; // sorted — done
      const projected = observedP95 * (current.capacityUnits / candidate.capacityUnits);
      if (projected <= this._config.targetUtilization) {
        return {
          resourceId,
          currentSize,
          recommendedSize: candidate.size,
          observedP95,
          hourlySavingsCents: current.hourlyCostCents - candidate.hourlyCostCents,
          reason:
            `p95 ${observedP95.toFixed(1)}% on ${currentSize} projects to ` +
            `${projected.toFixed(1)}% on ${candidate.size} (target ≤ ${this._config.targetUtilization}%)`,
        };
      }
    }
    return null;
  }

  /**
   * Batch recommendations. `observations` maps resourceId → observed p95.
   * Skips resources with no profitable candidate.
   */
  recommendAll(
    observations: ReadonlyArray<{ resourceId: string; currentSize: string; observedP95: number }>
  ): RightsizeRecommendation[] {
    const out: RightsizeRecommendation[] = [];
    for (const o of observations) {
      const r = this.recommend(o.resourceId, o.currentSize, o.observedP95);
      if (r) out.push(r);
    }
    return out.sort((a, b) => b.hourlySavingsCents - a.hourlySavingsCents);
  }

  /** Total hourly savings across a recommendation set, cents. */
  totalSavingsCents(recs: ReadonlyArray<RightsizeRecommendation>): number {
    return recs.reduce((sum, r) => sum + r.hourlySavingsCents, 0);
  }
}
