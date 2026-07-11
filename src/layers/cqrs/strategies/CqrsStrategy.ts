export interface ICqrsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultCqrsStrategy implements ICqrsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedCqrsStrategy implements ICqrsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackCqrsStrategy implements ICqrsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
