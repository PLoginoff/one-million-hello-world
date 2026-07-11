export interface IMessageBusStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultMessageBusStrategy implements IMessageBusStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedMessageBusStrategy implements IMessageBusStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackMessageBusStrategy implements IMessageBusStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
