export interface IAuthorizationStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultAuthorizationStrategy implements IAuthorizationStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedAuthorizationStrategy implements IAuthorizationStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackAuthorizationStrategy implements IAuthorizationStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
