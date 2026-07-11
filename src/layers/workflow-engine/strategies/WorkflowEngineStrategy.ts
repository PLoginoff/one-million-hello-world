export interface IWorkflowEngineStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultWorkflowEngineStrategy implements IWorkflowEngineStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedWorkflowEngineStrategy implements IWorkflowEngineStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackWorkflowEngineStrategy implements IWorkflowEngineStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
