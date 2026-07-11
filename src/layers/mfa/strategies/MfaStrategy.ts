export interface IMfaStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultMfaStrategy implements IMfaStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedMfaStrategy implements IMfaStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackMfaStrategy implements IMfaStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
