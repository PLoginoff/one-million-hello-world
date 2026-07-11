export interface ILoadBalancerStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultLoadBalancerStrategy implements ILoadBalancerStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedLoadBalancerStrategy implements ILoadBalancerStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackLoadBalancerStrategy implements ILoadBalancerStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
