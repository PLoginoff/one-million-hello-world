/**
 * Test assertions and utilities
 */

export class Assertions {
  static assertSuccess<T>(result: { success: boolean; data?: T; error?: { code: string; message: string } }): T {
    if (!result.success) {
      throw new Error(`Expected success but got error: ${result.error?.code} - ${result.error?.message}`);
    }
    return result.data as T;
  }

  static assertFailure(
    result: { success: boolean; error?: { code: string; message: string } },
    expectedCode?: string
  ): void {
    if (result.success) {
      throw new Error('Expected failure but got success');
    }
    if (expectedCode !== undefined && result.error?.code !== expectedCode) {
      throw new Error(`Expected error code ${expectedCode} but got ${result.error?.code}`);
    }
  }

  static assertInRange(value: number, min: number, max: number, name: string = 'value'): void {
    if (value < min || value > max) {
      throw new Error(`${name} (${value}) is not in range [${min}, ${max}]`);
    }
  }

  static assertTimestampRecent(timestamp: number, maxAgeMs: number = 5000): void {
    const age = Date.now() - timestamp;
    if (age < 0 || age > maxAgeMs) {
      throw new Error(`Timestamp is not recent: age=${age}ms, max=${maxAgeMs}ms`);
    }
  }
}
