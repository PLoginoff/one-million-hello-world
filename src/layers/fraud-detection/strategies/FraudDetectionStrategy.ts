export interface IFraudDetectionStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultFraudDetectionStrategy implements IFraudDetectionStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedFraudDetectionStrategy implements IFraudDetectionStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackFraudDetectionStrategy implements IFraudDetectionStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
