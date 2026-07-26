/**
 * DataTransformationMockAdapter
 *
 * Mock adapter with configurable responses for data-transformation layer.
 */

export interface IDataTransformationAdapter {
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}

export class DataTransformationMockAdapter implements IDataTransformationAdapter {
  private _config: Record<string, unknown>;
  private _executionCount: number;
  private _responses: Map<string, unknown>;

  constructor() {
    this._config = {};
    this._executionCount = 0;
    this._responses = new Map();
  }

  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;
    await Promise.resolve();
    const key = String(input);
    if (this._responses.has(key)) {
      return { success: true, data: this._responses.get(key) };
    }
    return {
      success: true,
      data: {
        adapter: 'mock',
        input: input,
        executionCount: this._executionCount,
        layer: 'data-transformation',
      },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'mock',
      layer: 'data-transformation',
      executionCount: this._executionCount,
      configuredResponses: this._responses.size,
    };
  }

  setResponse(key: string, response: unknown): void {
    this._responses.set(key, response);
  }

  clearResponses(): void {
    this._responses.clear();
  }

  getExecutionCount(): number {
    return this._executionCount;
  }
}
