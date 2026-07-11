export interface IBackupStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultBackupStrategy implements IBackupStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedBackupStrategy implements IBackupStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackBackupStrategy implements IBackupStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
