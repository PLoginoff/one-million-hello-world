export interface ICanaryDeployStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultCanaryDeployStrategy implements ICanaryDeployStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedCanaryDeployStrategy implements ICanaryDeployStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackCanaryDeployStrategy implements ICanaryDeployStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
