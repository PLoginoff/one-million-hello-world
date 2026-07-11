export interface IConfigurationStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultConfigurationStrategy implements IConfigurationStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedConfigurationStrategy implements IConfigurationStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackConfigurationStrategy implements IConfigurationStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
