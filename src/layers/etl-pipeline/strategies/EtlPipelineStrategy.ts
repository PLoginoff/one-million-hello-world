export interface IEtlPipelineStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultEtlPipelineStrategy implements IEtlPipelineStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedEtlPipelineStrategy implements IEtlPipelineStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackEtlPipelineStrategy implements IEtlPipelineStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
