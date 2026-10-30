/**
 * Online/Offline Consistency Checker — "same feature, same value?"
 *
 * Training-serving skew is the quiet killer in ML systems: the offline
 * store holds what the model trained on, the online store serves what
 * the model sees at inference — any gap between them is a correctness
 * bug. This checker samples entities across both stores and reports
 * the agreement rate.
 *
 * Comparison semantics:
 *   - numbers: exact equality (feature values are already materialized;
 *     tolerance-based comparison is a pipeline bug, not a feature)
 *   - arrays/vectors: element-wise equality
 *   - null vs missing: *distinct* — a missing offline row against an
 *     online value is a mismatch, not a pass
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { FeatureValue } from '../engine/FeatureStore';
import { ConsistencyReport, ConsistencySample } from './types';

export class ConsistencyChecker {
  /**
   * Check one feature across the supplied entity set.
   * `lookupOnline` / `lookupOffline` are callbacks so the checker works
   * over any store implementation — callers wire their own getters.
   */
  check(
    feature: string,
    entities: ReadonlyArray<string>,
    lookupOnline: (entity: string) => FeatureValue | undefined,
    lookupOffline: (entity: string) => FeatureValue | undefined,
    atMs: number,
  ): ConsistencyReport {
    const samples: ConsistencySample[] = [];
    let matched = 0;
    for (const entity of entities) {
      const online = lookupOnline(entity);
      const offline = lookupOffline(entity);
      const equal = featureEquals(online, offline);
      if (equal) matched += 1;
      samples.push({
        entity,
        feature,
        onlineValue: online ?? null,
        offlineValue: offline ?? null,
        atMs,
      });
    }
    const checked = entities.length;
    return {
      feature,
      checked,
      matched,
      mismatched: checked - matched,
      agreement: checked === 0 ? 1 : matched / checked,
      samples,
    };
  }

  /**
   * Run `check` across many features with the same lookups; per-feature
   * reports returned in input order.
   */
  checkAll(
    features: ReadonlyArray<string>,
    entities: ReadonlyArray<string>,
    lookupOnline: (entity: string, feature: string) => FeatureValue | undefined,
    lookupOffline: (entity: string, feature: string) => FeatureValue | undefined,
    atMs: number,
  ): ConsistencyReport[] {
    return features.map((f) =>
      this.check(
        f,
        entities,
        (e) => lookupOnline(e, f),
        (e) => lookupOffline(e, f),
        atMs,
      ),
    );
  }
}

/** Structural equality for feature values (vector-aware). */
export function featureEquals(a: FeatureValue | undefined, b: FeatureValue | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return a === b;
}
