export interface IOauth2Strategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultOauth2Strategy implements IOauth2Strategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedOauth2Strategy implements IOauth2Strategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackOauth2Strategy implements IOauth2Strategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
