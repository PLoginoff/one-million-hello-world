export interface ISpecificationStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSpecificationStrategy implements ISpecificationStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSpecificationStrategy implements ISpecificationStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSpecificationStrategy implements ISpecificationStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
