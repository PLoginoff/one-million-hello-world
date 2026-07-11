export interface IObservabilityStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultObservabilityStrategy implements IObservabilityStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedObservabilityStrategy implements IObservabilityStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackObservabilityStrategy implements IObservabilityStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
