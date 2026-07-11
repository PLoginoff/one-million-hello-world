export interface IReadModelStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultReadModelStrategy implements IReadModelStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedReadModelStrategy implements IReadModelStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackReadModelStrategy implements IReadModelStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
