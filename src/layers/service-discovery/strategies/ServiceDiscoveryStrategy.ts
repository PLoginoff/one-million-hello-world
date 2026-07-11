export interface IServiceDiscoveryStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultServiceDiscoveryStrategy implements IServiceDiscoveryStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedServiceDiscoveryStrategy implements IServiceDiscoveryStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackServiceDiscoveryStrategy implements IServiceDiscoveryStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
