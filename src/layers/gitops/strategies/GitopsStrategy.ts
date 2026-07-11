export interface IGitopsStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultGitopsStrategy implements IGitopsStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedGitopsStrategy implements IGitopsStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackGitopsStrategy implements IGitopsStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
