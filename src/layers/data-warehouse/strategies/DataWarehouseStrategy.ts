export interface IDataWarehouseStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultDataWarehouseStrategy implements IDataWarehouseStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedDataWarehouseStrategy implements IDataWarehouseStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackDataWarehouseStrategy implements IDataWarehouseStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
