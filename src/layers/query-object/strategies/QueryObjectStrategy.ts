export interface IQueryObjectStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultQueryObjectStrategy implements IQueryObjectStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedQueryObjectStrategy implements IQueryObjectStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackQueryObjectStrategy implements IQueryObjectStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
