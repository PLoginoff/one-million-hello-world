export interface IDdosProtectionStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultDdosProtectionStrategy implements IDdosProtectionStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedDdosProtectionStrategy implements IDdosProtectionStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackDdosProtectionStrategy implements IDdosProtectionStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
