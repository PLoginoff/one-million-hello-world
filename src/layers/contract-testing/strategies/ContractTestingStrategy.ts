export interface IContractTestingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultContractTestingStrategy implements IContractTestingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedContractTestingStrategy implements IContractTestingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackContractTestingStrategy implements IContractTestingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
