export interface IPropertyTestingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultPropertyTestingStrategy implements IPropertyTestingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedPropertyTestingStrategy implements IPropertyTestingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackPropertyTestingStrategy implements IPropertyTestingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
