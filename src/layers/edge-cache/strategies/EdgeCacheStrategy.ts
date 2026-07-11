export interface IEdgeCacheStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultEdgeCacheStrategy implements IEdgeCacheStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedEdgeCacheStrategy implements IEdgeCacheStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackEdgeCacheStrategy implements IEdgeCacheStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
