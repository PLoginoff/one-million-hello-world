/**
 * Enricher
 *
 * Lookup-table enrichment ("denormalizing join"). Given an item and a
 * `JoinSpec`, it resolves a join key from the item, finds the matching
 * record in the table, and either merges it into the item root or nests
 * it under a target path.
 *
 * Tables are plain `Record<string, Record<string, unknown>>` — in-memory,
 * no external deps. `buildTable` constructs one from an array of records,
 * the common shape for reference data.
 *
 * Missing keys follow `onMissing`: 'skip' (leave item unchanged),
 * 'null' (write null at target), or 'error' (report a TransformError).
 *
 * @module DataTransformationLayer/Engine
 */

import { getPath, parsePath, setPath } from './Path';
import { JoinSpec, LookupTable, TransformError } from './types';

export class Enricher {
  /**
   * Builds a lookup table from an array of records, keyed by `keyField`.
   * Duplicate keys keep the LAST record (documented overwrite order).
   * O(records).
   */
  static buildTable(
    name: string,
    records: readonly Record<string, unknown>[],
    keyField: string
  ): LookupTable {
    const map: Record<string, Record<string, unknown>> = {};
    const keyPath = parsePath(keyField);
    for (const record of records) {
      const key = getPath(record, keyPath);
      if (key === undefined || key === null) {
        continue;
      }
      map[String(key)] = record;
    }
    return { name, records: map };
  }

  /**
   * Joins one item against `spec`. Returns the enriched item (the input is
   * NOT mutated — a shallow+path-level copy is produced) and any errors.
   */
  join(
    item: Record<string, unknown>,
    spec: JoinSpec
  ): { output: Record<string, unknown>; errors: TransformError[] } {
    const errors: TransformError[] = [];
    const key = getPath(item, parsePath(spec.keyPath));
    const onMissing = spec.onMissing ?? 'skip';

    if (key === undefined || key === null) {
      if (onMissing === 'error') {
        errors.push({
          rule: `join:${spec.table.name}@${spec.keyPath}`,
          phase: 'shape',
          message: `join key '${spec.keyPath}' is missing`,
          sourceValue: key,
        });
        return { output: { ...item }, errors };
      }
      return { output: { ...item }, errors };
    }

    const record = spec.table.records[String(key)];
    const output = deepShallowCopy(item);

    if (record === undefined) {
      switch (onMissing) {
        case 'error':
          errors.push({
            rule: `join:${spec.table.name}@${spec.keyPath}`,
            phase: 'shape',
            message: `no record in '${spec.table.name}' for key '${String(key)}'`,
            sourceValue: key,
          });
          break;
        case 'null':
          if (spec.target) {
            setPath(output, parsePath(spec.target), null);
          }
          break;
        case 'skip':
          break;
      }
      return { output, errors };
    }

    if (spec.target) {
      setPath(output, parsePath(spec.target), record);
    } else {
      // merge-join: record fields land at item root, existing fields win
      // only when the record doesn't already define them (denormalize).
      for (const [field, value] of Object.entries(record)) {
        if (output[field] === undefined) {
          output[field] = value;
        }
      }
    }
    return { output, errors };
  }

  /**
   * Joins a batch of items; per-item errors are collected per index —
   * one bad key never aborts the batch.
   */
  joinAll(
    items: readonly Record<string, unknown>[],
    spec: JoinSpec
  ): { outputs: Record<string, unknown>[]; errors: ReadonlyArray<{ index: number; errors: TransformError[] }> } {
    const outputs: Record<string, unknown>[] = [];
    const errors: Array<{ index: number; errors: TransformError[] }> = [];
    items.forEach((item, index) => {
      const { output, errors: itemErrors } = this.join(item, spec);
      outputs.push(output);
      if (itemErrors.length > 0) {
        errors.push({ index, errors: itemErrors });
      }
    });
    return { outputs, errors };
  }
}

/**
 * Shallow copies the root and every object/array found at one level of
 * depth — enough that setPath writes never alias the input's nested
 * containers on the write path. O(top-level fields).
 */
function deepShallowCopy(item: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) {
      copy[key] = [...value];
    } else if (value !== null && typeof value === 'object') {
      copy[key] = { ...(value as Record<string, unknown>) };
    }
  }
  return copy;
}
