export interface IPerformanceTestingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultPerformanceTestingStrategy implements IPerformanceTestingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedPerformanceTestingStrategy implements IPerformanceTestingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackPerformanceTestingStrategy implements IPerformanceTestingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
