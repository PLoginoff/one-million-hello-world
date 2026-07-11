export interface ISecretsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSecretsStrategy implements ISecretsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSecretsStrategy implements ISecretsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSecretsStrategy implements ISecretsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
