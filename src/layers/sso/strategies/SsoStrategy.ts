export interface ISsoStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSsoStrategy implements ISsoStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSsoStrategy implements ISsoStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSsoStrategy implements ISsoStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
