export interface IJwtValidationStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultJwtValidationStrategy implements IJwtValidationStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedJwtValidationStrategy implements IJwtValidationStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackJwtValidationStrategy implements IJwtValidationStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
