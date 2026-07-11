export interface IInboxStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultInboxStrategy implements IInboxStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedInboxStrategy implements IInboxStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackInboxStrategy implements IInboxStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
