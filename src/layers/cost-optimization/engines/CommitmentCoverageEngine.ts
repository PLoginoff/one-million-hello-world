/**
 * Commitment Coverage Engine (reserved / savings-plan / spot arbitrage)
 *
 * Computes how much of the steady-state fleet demand is covered by
 * committed-use discounts, and what the remainder costs on-demand.
 *
 * Model: each commitment covers N instance-units/hour across a set of
 * eligible sizes. Demand comes from the inventory: each active resource
 * consumes 1 unit of its size per hour. Allocation is greedy — the
 * cheapest commitments (lowest unit cost) are applied first within each
 * size's demand pool, maximizing realized savings.
 *
 * This is the classic coverage analysis a FinOps team runs before buying
 * more RIs/Savings Plans: "what % of our baseline is committed, and what
 * would full coverage save?"
 *
 * @module CostOptimizationLayer/Engines
 */

import { Commitment, CoverageAnalysis } from './types';
import type { CostInventoryEngine } from './CostInventoryEngine';

export class CommitmentCoverageEngine {
  private readonly _commitments: Map<string, Commitment>;
  private readonly _inventory: CostInventoryEngine;

  constructor(inventory: CostInventoryEngine) {
    this._commitments = new Map();
    this._inventory = inventory;
  }

  addCommitment(c: Commitment): void {
    this._commitments.set(c.id, { ...c, coveredSizes: [...c.coveredSizes] });
  }

  removeCommitment(id: string): boolean {
    return this._commitments.delete(id);
  }

  /**
   * Greedy coverage analysis.
   *
   * For each size with demand, iterate commitments (cheapest unit first)
   * that cover that size, consuming `unitsPerHour` until demand or
   * commitment supply is exhausted. A commitment's units can span several
   * sizes (like a Savings Plan does), so we track remaining supply per
   * commitment globally.
   */
  analyze(): CoverageAnalysis {
    // demand: size -> units/hour needed
    const demand = new Map<string, number>();
    const demandCost = new Map<string, number>();
    for (const r of this._resources()) {
      demand.set(r.size, (demand.get(r.size) ?? 0) + 1);
      demandCost.set(r.size, r.hourlyCostCents);
    }

    let totalDemand = 0;
    for (const u of demand.values()) totalDemand += u;

    // commitments sorted cheapest-unit-first for greedy allocation
    const commitments = [...this._commitments.values()].sort(
      (a, b) => a.unitHourlyCostCents - b.unitHourlyCostCents
    );
    const remaining = new Map<string, number>(commitments.map((c) => [c.id, c.unitsPerHour]));

    let effectiveCents = 0;
    let coveredUnits = 0;

    for (const [size, units] of demand) {
      const onDemandPrice = demandCost.get(size) ?? 0;
      let toCover = units;
      for (const c of commitments) {
        if (toCover === 0) break;
        if (!c.coveredSizes.includes(size)) continue;
        const supply = remaining.get(c.id) ?? 0;
        if (supply === 0) continue;
        const take = Math.min(supply, toCover);
        remaining.set(c.id, supply - take);
        toCover -= take;
        coveredUnits += take;
        effectiveCents += take * c.unitHourlyCostCents;
      }
      effectiveCents += toCover * onDemandPrice; // residual billed on-demand
    }

    let allOnDemand = 0;
    for (const r of this._resources()) allOnDemand += r.hourlyCostCents;

    return {
      totalDemandUnits: totalDemand,
      coveredUnits,
      coveragePct: totalDemand === 0 ? 0 : (coveredUnits / totalDemand) * 100,
      onDemandUnits: totalDemand - coveredUnits,
      allOnDemandHourlyCents: allOnDemand,
      effectiveHourlyCents: effectiveCents,
      savingsCents: allOnDemand - effectiveCents,
    };
  }

  /**
   * How many units of `commitmentId` are actually consumed by current
   * demand — used to flag under-utilized commitments (wasted spend).
   */
  utilizationOf(commitmentId: string): { used: number; total: number; utilizationPct: number } {
    const c = this._commitments.get(commitmentId);
    if (!c) throw new Error(`Unknown commitment: ${commitmentId}`);

    // Re-run the greedy allocation and inspect this commitment's remainder.
    const demand = new Map<string, number>();
    for (const r of this._resources()) {
      demand.set(r.size, (demand.get(r.size) ?? 0) + 1);
    }
    const sorted = [...this._commitments.values()].sort(
      (a, b) => a.unitHourlyCostCents - b.unitHourlyCostCents
    );
    const remaining = new Map<string, number>(sorted.map((x) => [x.id, x.unitsPerHour]));
    for (const [size, units] of demand) {
      let toCover = units;
      for (const x of sorted) {
        if (toCover === 0) break;
        if (!x.coveredSizes.includes(size)) continue;
        const supply = remaining.get(x.id) ?? 0;
        const take = Math.min(supply, toCover);
        remaining.set(x.id, supply - take);
        toCover -= take;
      }
    }
    const used = c.unitsPerHour - (remaining.get(commitmentId) ?? 0);
    return {
      used,
      total: c.unitsPerHour,
      utilizationPct: c.unitsPerHour === 0 ? 0 : (used / c.unitsPerHour) * 100,
    };
  }

  private _resources() {
    const out: Array<{ size: string; hourlyCostCents: number }> = [];
    // Access inventory internals through the public breakdown — resources
    // are exposed per cost center; flatten them back out.
    for (const b of this._inventory.breakdown()) {
      for (const id of b.resourceIds) {
        const r = this._inventory.getResource(id);
        if (r) out.push({ size: r.size, hourlyCostCents: r.hourlyCostCents });
      }
    }
    return out;
  }
}
