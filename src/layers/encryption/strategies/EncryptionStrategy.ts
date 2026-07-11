export interface IEncryptionStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultEncryptionStrategy implements IEncryptionStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedEncryptionStrategy implements IEncryptionStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackEncryptionStrategy implements IEncryptionStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
