export interface IIdentityStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultIdentityStrategy implements IIdentityStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedIdentityStrategy implements IIdentityStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackIdentityStrategy implements IIdentityStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
