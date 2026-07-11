export interface IStreamProcessingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultStreamProcessingStrategy implements IStreamProcessingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedStreamProcessingStrategy implements IStreamProcessingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackStreamProcessingStrategy implements IStreamProcessingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
