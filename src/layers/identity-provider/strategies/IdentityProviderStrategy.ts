export interface IIdentityProviderStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultIdentityProviderStrategy implements IIdentityProviderStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedIdentityProviderStrategy implements IIdentityProviderStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackIdentityProviderStrategy implements IIdentityProviderStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
