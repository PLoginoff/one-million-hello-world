export interface IMigrationsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultMigrationsStrategy implements IMigrationsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedMigrationsStrategy implements IMigrationsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackMigrationsStrategy implements IMigrationsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
