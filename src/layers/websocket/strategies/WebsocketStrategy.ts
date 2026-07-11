export interface IWebsocketStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultWebsocketStrategy implements IWebsocketStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedWebsocketStrategy implements IWebsocketStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackWebsocketStrategy implements IWebsocketStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
