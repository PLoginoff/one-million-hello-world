/**
 * Saga Test Runner
 *
 * Test runner for executing saga test scenarios.
 * Provides methods for running and validating saga tests.
 */

import { SagaExecutionEntity } from '../domain/entities/SagaExecution';
import { SagaConfig } from '../domain/value-objects/SagaConfig';

export interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<SagaExecutionEntity>;
  validate: (execution: SagaExecutionEntity) => boolean;
  cleanup: () => Promise<void>;
}

export interface TestResult {
  scenarioName: string;
  passed: boolean;
  duration: number;
  error?: string;
}

export class SagaTestRunner {
  private readonly _scenarios: TestScenario[];
  private readonly _results: TestResult[];

  constructor() {
    this._scenarios = [];
    this._results = [];
  }

  /**
   * Add test scenario
   */
  addScenario(scenario: TestScenario): void {
    this._scenarios.push(scenario);
  }

  /**
   * Run all scenarios
   */
  async runAll(): Promise<TestResult[]> {
    this._results.length = 0;

    for (const scenario of this._scenarios) {
      const result = await this._runScenario(scenario);
      this._results.push(result);
    }

    return this._results;
  }

  /**
   * Run specific scenario
   */
  async runScenario(name: string): Promise<TestResult | null> {
    const scenario = this._scenarios.find(s => s.name === name);
    if (!scenario) {
      return null;
    }
    return this._runScenario(scenario);
  }

  /**
   * Get results
   */
  getResults(): TestResult[] {
    return [...this._results];
  }

  /**
   * Get passed count
   */
  getPassedCount(): number {
    return this._results.filter(r => r.passed).length;
  }

  /**
   * Get failed count
   */
  getFailedCount(): number {
    return this._results.filter(r => !r.passed).length;
  }

  /**
   * Clear scenarios
   */
  clearScenarios(): void {
    this._scenarios.length = 0;
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this._results.length = 0;
  }

  private async _runScenario(scenario: TestScenario): Promise<TestResult> {
    const startTime = Date.now();

    try {
      await scenario.setup();
      const execution = await scenario.execute();
      const passed = scenario.validate(execution);
      await scenario.cleanup();

      return {
        scenarioName: scenario.name,
        passed,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        scenarioName: scenario.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
