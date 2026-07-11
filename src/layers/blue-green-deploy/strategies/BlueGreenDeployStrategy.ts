export interface IBlueGreenDeployStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultBlueGreenDeployStrategy implements IBlueGreenDeployStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedBlueGreenDeployStrategy implements IBlueGreenDeployStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackBlueGreenDeployStrategy implements IBlueGreenDeployStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
