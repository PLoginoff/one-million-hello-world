export interface IMutationTestingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultMutationTestingStrategy implements IMutationTestingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedMutationTestingStrategy implements IMutationTestingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackMutationTestingStrategy implements IMutationTestingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
