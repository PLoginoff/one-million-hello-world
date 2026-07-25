/**
 * ControllerDefaultStrategy
 */

export interface IControllerStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ControllerDefaultStrategy implements IControllerStrategy {
  readonly name = 'default';
  readonly priority = 10;
  private _executionCount: number;

  constructor() {
    this._executionCount = 0;
  }

  canHandle(input: unknown): boolean {
    return input !== null && input !== undefined;
  }

  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;
    await Promise.resolve();
    return { success: true, data: { strategy: this.name, input: input, executionCount: this._executionCount } };
  }

  getExecutionCount(): number {
    return this._executionCount;
  }
}
