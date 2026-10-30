/**
 * TransformationEngine
 *
 * Facade composing the engine primitives into one pipeline:
 *
 *   item ──► compiled MappingSpec (validate/coerce/transform/write)
 *        ──► JoinSpec enrichment (lookup-table join)
 *        ──► output
 *
 * and for collections:
 *
 *   items ──► BatchTransformer (per-item errors)
 *         ──► optional Aggregator (group-by + fold)
 *
 * Compilation caching: `compile()` results can be registered under a name
 * via `registerSpec()` so hot pipelines pay the parse/resolve cost once.
 * A small internal LRU bounds the compiled-spec cache.
 *
 * @module DataTransformationLayer/Engine
 */

import { Aggregator } from './Aggregator';
import { BatchTransformer } from './BatchTransformer';
import { CompiledMapping, MappingEngine } from './MappingEngine';
import { Enricher } from './Enricher';
import {
  AggregateResult,
  AggregateSpec,
  BatchResult,
  CoercionMode,
  JoinSpec,
  MappingSpec,
  TransformError,
} from './types';

/**
 * Engine-level configuration.
 */
export interface TransformationEngineOptions {
  readonly coercionMode?: CoercionMode;
  /** Max compiled specs kept in the named-spec cache. Default 64. */
  readonly specCacheSize?: number;
}

/**
 * Full single-item pipeline result.
 */
export interface EngineTransformResult {
  readonly ok: boolean;
  readonly output?: Record<string, unknown>;
  readonly errors: readonly TransformError[];
}

export class TransformationEngine {
  private readonly _mapper: MappingEngine;
  private readonly _enricher: Enricher;
  private readonly _aggregator: Aggregator;
  private readonly _batch: BatchTransformer;
  private readonly _specCache: Map<string, CompiledMapping>;
  private readonly _specCacheLimit: number;

  constructor(options: TransformationEngineOptions = {}) {
    this._mapper = new MappingEngine({ coercionMode: options.coercionMode });
    this._enricher = new Enricher();
    this._aggregator = new Aggregator();
    this._batch = new BatchTransformer();
    this._specCache = new Map();
    this._specCacheLimit = options.specCacheSize ?? 64;
  }

  /** Exposed for callers building their own pipelines. */
  get mapper(): MappingEngine {
    return this._mapper;
  }

  get enricher(): Enricher {
    return this._enricher;
  }

  get aggregator(): Aggregator {
    return this._aggregator;
  }

  /**
   * Compiles a spec into a reusable mapping closure.
   */
  compile(spec: MappingSpec): CompiledMapping {
    return this._mapper.compile(spec);
  }

  /**
   * Compiles and registers a spec under `name` for reuse. Subsequent
   * `transformNamed` calls reuse the same compiled closure — the
   * "compile once, apply many times" contract. LRU-bounded.
   */
  registerSpec(name: string, spec: MappingSpec): CompiledMapping {
    if (this._specCache.has(name)) {
      this._specCache.delete(name);
    } else if (this._specCache.size >= this._specCacheLimit) {
      const oldest = this._specCache.keys().next();
      if (!oldest.done) {
        this._specCache.delete(oldest.value);
      }
    }
    const compiled = this._mapper.compile(spec);
    this._specCache.set(name, compiled);
    return compiled;
  }

  /** Removes a named spec. */
  unregisterSpec(name: string): boolean {
    return this._specCache.delete(name);
  }

  /** Number of registered specs. */
  get specCount(): number {
    return this._specCache.size;
  }

  /**
   * Transforms a single item through a registered spec, then applies an
   * optional enrichment join.
   */
  transformNamed(
    name: string,
    item: Record<string, unknown>,
    join?: JoinSpec
  ): EngineTransformResult {
    const compiled = this._specCache.get(name);
    if (!compiled) {
      throw new Error(`No mapping spec registered under '${name}'`);
    }
    return this.apply(compiled, item, join);
  }

  /**
   * Transforms a single item through a compiled mapping, then applies an
   * optional enrichment join.
   */
  apply(
    compiled: CompiledMapping,
    item: Record<string, unknown>,
    join?: JoinSpec
  ): EngineTransformResult {
    const { output, errors } = compiled(item);
    if (errors.length > 0) {
      return { ok: false, output, errors };
    }
    if (join) {
      const joined = this._enricher.join(output, join);
      if (joined.errors.length > 0) {
        return { ok: false, output: joined.output, errors: joined.errors };
      }
      return { ok: true, output: joined.output, errors: [] };
    }
    return { ok: true, output, errors: [] };
  }

  /**
   * One-shot: compile the spec fresh and apply it. Prefer compile() +
   * apply() when the same spec runs more than once.
   */
  transform(
    spec: MappingSpec,
    item: Record<string, unknown>,
    join?: JoinSpec
  ): EngineTransformResult {
    return this.apply(this._mapper.compile(spec), item, join);
  }

  /**
   * Batch transform through a compiled mapping; optionally enriches each
   * successful output through a join. Per-item errors never abort.
   */
  transformBatch(
    items: readonly Record<string, unknown>[],
    compiled: CompiledMapping,
    join?: JoinSpec
  ): BatchResult<Record<string, unknown>> {
    const batch = this._batch.transformAll(items, compiled);
    if (!join) {
      return batch;
    }
    // enrich each successful output; join errors convert the item to failed
    const items2 = batch.items.map((item) => {
      if (!item.ok || item.output === undefined) {
        return item;
      }
      const joined = this._enricher.join(item.output, join);
      if (joined.errors.length > 0) {
        return { index: item.index, ok: false as const, errors: joined.errors };
      }
      return { index: item.index, ok: true as const, output: joined.output, errors: [] as TransformError[] };
    });
    const succeeded = items2.filter((i) => i.ok).length;
    return { total: items.length, succeeded, failed: items.length - succeeded, items: items2 };
  }

  /**
   * Runs a group-by aggregation over items.
   */
  aggregate(items: readonly Record<string, unknown>[], spec: AggregateSpec): AggregateResult {
    return this._aggregator.aggregate(items, spec);
  }

  /**
   * Map → aggregate: transforms items then aggregates the outputs.
   * Failed items are excluded from aggregation and returned separately.
   */
  mapAndAggregate(
    items: readonly Record<string, unknown>[],
    spec: MappingSpec,
    aggregateSpec: AggregateSpec
  ): { result: AggregateResult; failures: readonly TransformError[][] } {
    const compiled = this._mapper.compile(spec);
    const batch = this._batch.transformAll(items, compiled);
    const good = batch.items.filter((i) => i.ok && i.output !== undefined).map((i) => i.output!);
    const failures = batch.items.filter((i) => !i.ok).map((i) => i.errors as TransformError[]);
    return { result: this._aggregator.aggregate(good, aggregateSpec), failures };
  }
}
