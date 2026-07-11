export interface IWriteModelStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultWriteModelStrategy implements IWriteModelStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedWriteModelStrategy implements IWriteModelStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackWriteModelStrategy implements IWriteModelStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
