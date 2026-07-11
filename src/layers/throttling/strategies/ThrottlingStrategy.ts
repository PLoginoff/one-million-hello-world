export interface IThrottlingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultThrottlingStrategy implements IThrottlingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedThrottlingStrategy implements IThrottlingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackThrottlingStrategy implements IThrottlingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
