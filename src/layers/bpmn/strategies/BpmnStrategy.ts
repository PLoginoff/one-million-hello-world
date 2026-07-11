export interface IBpmnStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultBpmnStrategy implements IBpmnStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedBpmnStrategy implements IBpmnStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackBpmnStrategy implements IBpmnStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
