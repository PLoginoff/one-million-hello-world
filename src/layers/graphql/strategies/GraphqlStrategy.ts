export interface IGraphqlStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultGraphqlStrategy implements IGraphqlStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedGraphqlStrategy implements IGraphqlStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackGraphqlStrategy implements IGraphqlStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
