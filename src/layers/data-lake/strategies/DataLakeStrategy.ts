export interface IDataLakeStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultDataLakeStrategy implements IDataLakeStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedDataLakeStrategy implements IDataLakeStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackDataLakeStrategy implements IDataLakeStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
