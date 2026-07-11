export interface IAnalyticsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultAnalyticsStrategy implements IAnalyticsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedAnalyticsStrategy implements IAnalyticsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackAnalyticsStrategy implements IAnalyticsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
