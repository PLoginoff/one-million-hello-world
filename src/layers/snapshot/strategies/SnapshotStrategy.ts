export interface ISnapshotStrategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class DefaultSnapshotStrategy implements ISnapshotStrategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class OptimizedSnapshotStrategy implements ISnapshotStrategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class FallbackSnapshotStrategy implements ISnapshotStrategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
