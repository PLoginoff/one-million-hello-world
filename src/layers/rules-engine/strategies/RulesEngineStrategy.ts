export interface IRulesEngineStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultRulesEngineStrategy implements IRulesEngineStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedRulesEngineStrategy implements IRulesEngineStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackRulesEngineStrategy implements IRulesEngineStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
