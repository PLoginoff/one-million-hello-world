/**
 * BlueGreenDeployInMemoryAdapter
 *
 * In-memory adapter for testing for blue-green-deploy layer.
 */

export interface IBlueGreenDeployAdapter {
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}

export class BlueGreenDeployInMemoryAdapter implements IBlueGreenDeployAdapter {
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
        adapter: 'inmemory',
        input: input,
        executionCount: this._executionCount,
        layer: 'blue-green-deploy',
      },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'inmemory',
      layer: 'blue-green-deploy',
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
