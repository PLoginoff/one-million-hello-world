/**
 * BatchTransformer
 *
 * Applies a compiled mapping to a collection with per-item error
 * collection — one malformed item never aborts the batch. Wraps
 * `CompiledMapping` results into `ItemResult`s and aggregates a
 * `BatchResult`.
 *
 * Beyond the compiled mapping itself, a thrown exception inside the
 * closure (a rule transform that throws unexpectedly, a pathological
 * input shape) is also captured per-item — so the batch contract
 * ("every item produces an ItemResult") holds unconditionally.
 *
 * @module DataTransformationLayer/Engine
 */

import { CompiledMapping } from './MappingEngine';
import { BatchResult, ItemResult, TransformError } from './types';

export class BatchTransformer {
  /**
   * Maps every item through `compiled`, collecting per-item outcomes.
   * O(items × rules).
   */
  transformAll(items: readonly Record<string, unknown>[], compiled: CompiledMapping): BatchResult<Record<string, unknown>> {
    const results: ItemResult<Record<string, unknown>>[] = new Array(items.length);
    let succeeded = 0;

    items.forEach((item, index) => {
      try {
        const { output, errors } = compiled(item);
        if (errors.length === 0) {
          results[index] = { index, ok: true, output, errors };
          succeeded += 1;
        } else {
          results[index] = { index, ok: false, errors };
        }
      } catch (error) {
        // defensive: the mapping shouldn't throw (rules capture errors),
        // but a hostile input could still trip setPath etc. Convert to a
        // per-item failure rather than aborting the batch.
        results[index] = {
          index,
          ok: false,
          errors: [
            {
              rule: '<engine>',
              phase: 'shape',
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    });

    return {
      total: items.length,
      succeeded,
      failed: items.length - succeeded,
      items: results,
    };
  }

  /**
   * Maps items and returns only the successful outputs — a convenience
   * for pipelines that quarantine failures separately via `transformAll`.
   */
  transformSuccessful(
    items: readonly Record<string, unknown>[],
    compiled: CompiledMapping
  ): { outputs: Record<string, unknown>[]; failures: ItemResult[] } {
    const batch = this.transformAll(items, compiled);
    const outputs: Record<string, unknown>[] = [];
    const failures: ItemResult[] = [];
    for (const item of batch.items) {
      if (item.ok && item.output !== undefined) {
        outputs.push(item.output);
      } else {
        failures.push(item);
      }
    }
    return { outputs, failures };
  }
}
