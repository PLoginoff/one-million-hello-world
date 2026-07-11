export interface ISiemStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSiemStrategy implements ISiemStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSiemStrategy implements ISiemStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSiemStrategy implements ISiemStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
