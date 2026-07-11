export interface IFeatureFlagsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultFeatureFlagsStrategy implements IFeatureFlagsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedFeatureFlagsStrategy implements IFeatureFlagsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackFeatureFlagsStrategy implements IFeatureFlagsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
