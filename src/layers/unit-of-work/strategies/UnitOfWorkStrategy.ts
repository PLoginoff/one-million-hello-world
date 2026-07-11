export interface IUnitOfWorkStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultUnitOfWorkStrategy implements IUnitOfWorkStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedUnitOfWorkStrategy implements IUnitOfWorkStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackUnitOfWorkStrategy implements IUnitOfWorkStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
