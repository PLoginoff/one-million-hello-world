export interface IAuditStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultAuditStrategy implements IAuditStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedAuditStrategy implements IAuditStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackAuditStrategy implements IAuditStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
