export interface ISchemaRegistryStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSchemaRegistryStrategy implements ISchemaRegistryStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSchemaRegistryStrategy implements ISchemaRegistryStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSchemaRegistryStrategy implements ISchemaRegistryStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
