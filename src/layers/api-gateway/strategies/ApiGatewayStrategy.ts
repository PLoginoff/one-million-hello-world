export interface IApiGatewayStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultApiGatewayStrategy implements IApiGatewayStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedApiGatewayStrategy implements IApiGatewayStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackApiGatewayStrategy implements IApiGatewayStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
