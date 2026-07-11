export interface IChaosEngineeringStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultChaosEngineeringStrategy implements IChaosEngineeringStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedChaosEngineeringStrategy implements IChaosEngineeringStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackChaosEngineeringStrategy implements IChaosEngineeringStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
