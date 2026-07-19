/**
 * Shared test fixtures for layer tests
 */

export interface TestContextData {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export class LayerFixtures {
  static createContext(input: unknown = 'test-input', metadata: Record<string, unknown> = {}): TestContextData {
    return {
      input,
      metadata: { requestId: 'req-123', ...metadata },
      timestamp: new Date('2024-01-01T00:00:00Z'),
    };
  }

  static createConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      enabled: true,
      timeout: 30000,
      retries: 3,
      logLevel: 'info',
      ...overrides,
    };
  }

  static randomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  static randomId(): string {
    return `id-${Date.now()}-${this.randomString(6)}`;
  }

  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
