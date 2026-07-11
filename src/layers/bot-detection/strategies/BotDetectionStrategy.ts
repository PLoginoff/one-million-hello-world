export interface IBotDetectionStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultBotDetectionStrategy implements IBotDetectionStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedBotDetectionStrategy implements IBotDetectionStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackBotDetectionStrategy implements IBotDetectionStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
