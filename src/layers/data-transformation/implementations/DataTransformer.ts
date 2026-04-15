/**
 * Data Transformer Implementation
 * 
 * Concrete implementation of IDataTransformer.
 * Handles normalization, enrichment, and mapping.
 */

import { IDataTransformer } from '../interfaces/IDataTransformer';
import {
  TransformationRule,
  EnrichmentData,
  TransformationResult,
  TransformationConfig,
} from '../types/data-transformation-types';

export class DataTransformer implements IDataTransformer {
  private _config: TransformationConfig;

  constructor() {
    this._config = {
      enableNormalization: true,
      enableEnrichment: true,
      enableMapping: true,
    };
  }

  normalize<T>(data: T): TransformationResult<T> {
    if (!this._config.enableNormalization) {
      return { success: true, data };
    }

    if (typeof data !== 'object' || data === null) {
      return { success: true, data };
    }

    const normalized = { ...data } as Record<string, unknown>;

    for (const key in normalized) {
      if (typeof normalized[key] === 'string') {
        normalized[key] = (normalized[key] as string).trim().toLowerCase();
      }
    }

    return { success: true, data: normalized as T };
  }

  enrich<T>(data: T, enrichment: EnrichmentData): TransformationResult<T> {
    if (!this._config.enableEnrichment) {
      return { success: true, data };
    }

    if (typeof data !== 'object' || data === null) {
      return { success: true, data };
    }

    const enriched = { ...data, ...enrichment.data } as T;

    return { success: true, data: enriched };
  }

  map<T, U>(data: T, rules: TransformationRule[]): TransformationResult<U> {
    if (!this._config.enableMapping) {
      return { success: true, data: data as unknown as U };
    }

    if (typeof data !== 'object' || data === null) {
      return { success: false, errors: ['Data must be an object for mapping'] };
    }

    const source = data as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const rule of rules) {
      const sourceValue = source[rule.sourceField];

      if (sourceValue === undefined) {
        errors.push(`Source field ${rule.sourceField} not found`);
        continue;
      }

      const transformedValue = rule.transform ? rule.transform(sourceValue) : sourceValue;
      target[rule.targetField] = transformedValue;
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: target as U };
  }

  transform<T, U>(
    data: T,
    rules?: TransformationRule[],
    enrichment?: EnrichmentData,
  ): TransformationResult<U> {
    let result: TransformationResult<T> = { success: true, data };

    if (this._config.enableNormalization) {
      result = this.normalize(result.data as T);
      if (!result.success) {
        return { success: false, errors: result.errors } as any;
      }
    }

    if (this._config.enableEnrichment && enrichment) {
      result = this.enrich(result.data as T, enrichment);
      if (!result.success) {
        return { success: false, errors: result.errors } as any;
      }
    }

    if (this._config.enableMapping && rules) {
      const mappedResult = this.map(result.data as T, rules);
      return mappedResult;
    }

    return { success: true, data: result.data as unknown as U };
  }

  setConfig(config: TransformationConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): TransformationConfig {
    return { ...this._config };
  }
}
