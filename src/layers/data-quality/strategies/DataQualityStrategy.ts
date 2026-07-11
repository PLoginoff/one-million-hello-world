export interface IDataQualityStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultDataQualityStrategy implements IDataQualityStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedDataQualityStrategy implements IDataQualityStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackDataQualityStrategy implements IDataQualityStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
