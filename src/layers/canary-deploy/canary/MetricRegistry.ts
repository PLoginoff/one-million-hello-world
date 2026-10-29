/**
 * Canary Deploy — Metric Registry
 *
 * Central registry of metric descriptors: which source provides a metric,
 * its direction (higher/lower is worse), unit, and default gate parameters.
 * Real canary systems (Flagger, Argo Rollouts) declare metrics once in a
 * registry and reference them by name across gates — this is that registry.
 *
 * Also provides `deriveGate(name)` — building a full MetricGate from the
 * registered descriptor + overrides — so gate configs stay DRY.
 *
 * @module CanaryDeploy/Canary
 */

import { CanaryMetricKind, MetricGate } from './CanaryTypes';

export interface MetricDescriptor {
  readonly name: string;
  readonly kind: CanaryMetricKind;
  /** true → larger values are worse (error rate, latency); false → worse when smaller (throughput, success %). */
  readonly higherIsWorse: boolean;
  readonly unit: string;
  readonly description?: string;
  /** Default comparison parameters; a gate built via deriveGate inherits these. */
  readonly defaults: {
    readonly mode?: MetricGate['mode'];
    readonly threshold?: number;
    readonly toleranceRatio?: number;
    readonly minSamples?: number;
    readonly alpha?: number;
  };
}

export class MetricRegistry {
  private readonly _descriptors = new Map<string, MetricDescriptor>();

  register(descriptor: MetricDescriptor): void {
    if (this._descriptors.has(descriptor.name)) {
      throw new Error(`metric '${descriptor.name}' already registered`);
    }
    this._descriptors.set(descriptor.name, descriptor);
  }

  unregister(name: string): boolean {
    return this._descriptors.delete(name);
  }

  get(name: string): MetricDescriptor | undefined {
    return this._descriptors.get(name);
  }

  get names(): ReadonlyArray<string> {
    return [...this._descriptors.keys()];
  }

  /** All metrics where higher values are worse — for gate polarity checks. */
  higherIsWorse(name: string): boolean {
    const d = this._descriptors.get(name);
    if (!d) throw new Error(`unknown metric '${name}'`);
    return d.higherIsWorse;
  }

  /**
   * Build a MetricGate from the registered descriptor + explicit overrides.
   * Gate name defaults to metric name; mode defaults to descriptor default
   * or 'relative' (canary-vs-baseline is the common case).
   */
  deriveGate(name: string, overrides: Partial<MetricGate> = {}): MetricGate {
    const d = this._descriptors.get(name);
    if (!d) throw new Error(`unknown metric '${name}'`);
    return {
      name: overrides.name ?? name,
      metric: d.kind === 'custom' ? 'custom' : d.kind,
      customName: d.kind === 'custom' ? name : undefined,
      mode: overrides.mode ?? d.defaults.mode ?? 'relative',
      threshold: overrides.threshold ?? d.defaults.threshold,
      toleranceRatio: overrides.toleranceRatio ?? d.defaults.toleranceRatio,
      alpha: overrides.alpha ?? d.defaults.alpha,
      minSamples: overrides.minSamples ?? d.defaults.minSamples ?? 1,
      allowedFailures: overrides.allowedFailures,
    };
  }

  /** Register the standard canary metric set (error rate, p50/p99, saturation). */
  registerStandardSet(): void {
    const defs: MetricDescriptor[] = [
      {
        name: 'error-rate',
        kind: 'error-rate',
        higherIsWorse: true,
        unit: 'ratio',
        description: 'fraction of requests returning errors',
        defaults: { mode: 'absolute', threshold: 0.05, minSamples: 30 },
      },
      {
        name: 'latency-p99',
        kind: 'latency-p99',
        higherIsWorse: true,
        unit: 'ms',
        description: '99th percentile request latency',
        defaults: { mode: 'relative', toleranceRatio: 0.1, minSamples: 30 },
      },
      {
        name: 'latency-p50',
        kind: 'latency-p50',
        higherIsWorse: true,
        unit: 'ms',
        description: 'median request latency',
        defaults: { mode: 'relative', toleranceRatio: 0.15, minSamples: 30 },
      },
      {
        name: 'saturation',
        kind: 'saturation',
        higherIsWorse: true,
        unit: 'ratio',
        description: 'resource utilization 0..1',
        defaults: { mode: 'absolute', threshold: 0.85, minSamples: 10 },
      },
    ];
    for (const d of defs) {
      if (!this._descriptors.has(d.name)) this._descriptors.set(d.name, d);
    }
  }
}
