export interface IServiceMeshStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultServiceMeshStrategy implements IServiceMeshStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedServiceMeshStrategy implements IServiceMeshStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackServiceMeshStrategy implements IServiceMeshStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
