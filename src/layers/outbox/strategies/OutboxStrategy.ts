export interface IOutboxStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultOutboxStrategy implements IOutboxStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedOutboxStrategy implements IOutboxStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackOutboxStrategy implements IOutboxStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
