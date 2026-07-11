export interface IDeadLetterStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultDeadLetterStrategy implements IDeadLetterStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedDeadLetterStrategy implements IDeadLetterStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackDeadLetterStrategy implements IDeadLetterStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
