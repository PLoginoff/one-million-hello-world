export interface IEventSourcingStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultEventSourcingStrategy implements IEventSourcingStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedEventSourcingStrategy implements IEventSourcingStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackEventSourcingStrategy implements IEventSourcingStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
