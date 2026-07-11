#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, char) => char.toUpperCase());
}

function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function generateStrategies(layerName) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const strategyA = `export interface I${pascal}Strategy {
  readonly name: string;
  execute(input: unknown): unknown;
}

export class Default${pascal}Strategy implements I${pascal}Strategy {
  readonly name = 'default';

  execute(input: unknown): unknown {
    return { strategy: 'default', input };
  }
}

export class Optimized${pascal}Strategy implements I${pascal}Strategy {
  readonly name = 'optimized';

  execute(input: unknown): unknown {
    return { strategy: 'optimized', input, optimized: true };
  }
}

export class Fallback${pascal}Strategy implements I${pascal}Strategy {
  readonly name = 'fallback';

  execute(input: unknown): unknown {
    return { strategy: 'fallback', input, fallback: true };
  }
}
`;

  const index = `export { I${pascal}Strategy } from './${pascal}Strategy';
export { Default${pascal}Strategy } from './${pascal}Strategy';
export { Optimized${pascal}Strategy } from './${pascal}Strategy';
export { Fallback${pascal}Strategy } from './${pascal}Strategy';
`;

  writeFile(path.join(baseDir, 'strategies', `${pascal}Strategy.ts`), strategyA);
  writeFile(path.join(baseDir, 'strategies', 'index.ts'), index);
}

function generateFactories(layerName) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const factoryContent = `import { ${pascal} } from '../implementations/${pascal}';
import { Default${pascal}Strategy, Optimized${pascal}Strategy } from '../strategies/${pascal}Strategy';

export class ${pascal}Factory {
  static createDefault(): ${pascal} {
    const instance = new ${pascal}();
    instance.configure({ strategy: new Default${pascal}Strategy() });
    return instance;
  }

  static createOptimized(): ${pascal} {
    const instance = new ${pascal}();
    instance.configure({ strategy: new Optimized${pascal}Strategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ${pascal} {
    const instance = new ${pascal}();
    instance.configure(config);
    return instance;
  }
}
`;

  const index = `export { ${pascal}Factory } from './${pascal}Factory';
`;

  writeFile(path.join(baseDir, 'factories', `${pascal}Factory.ts`), factoryContent);
  writeFile(path.join(baseDir, 'factories', 'index.ts'), index);
}

function generateConfiguration(layerName) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const defaults = `import { ${pascal}Config } from '../../types/${kebab}-types';

export const DEFAULT_${pascal.toUpperCase()}_CONFIG: ${pascal}Config = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
`;

  const builder = `import { ${pascal}Config } from '../../types/${kebab}-types';
import { DEFAULT_${pascal.toUpperCase()}_CONFIG } from '../defaults/${pascal}Defaults';

export class ${pascal}ConfigBuilder {
  private _config: ${pascal}Config;

  constructor() {
    this._config = { ...DEFAULT_${pascal.toUpperCase()}_CONFIG };
  }

  withEnabled(enabled: boolean): ${pascal}ConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ${pascal}ConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ${pascal}ConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ${pascal}ConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ${pascal}Config {
    return { ...this._config };
  }
}
`;

  const validator = `import { ${pascal}Config } from '../../types/${kebab}-types';

export class ${pascal}ConfigValidator {
  validate(config: Partial<${pascal}Config>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.timeout !== undefined && config.timeout < 0) {
      errors.push('timeout must be non-negative');
    }

    if (config.retries !== undefined && config.retries < 0) {
      errors.push('retries must be non-negative');
    }

    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (config.logLevel !== undefined && !validLogLevels.includes(config.logLevel)) {
      errors.push('logLevel must be one of debug, info, warn, error');
    }

    return { valid: errors.length === 0, errors };
  }
}
`;

  writeFile(path.join(baseDir, 'configuration', 'defaults', `${pascal}Defaults.ts`), defaults);
  writeFile(path.join(baseDir, 'configuration', 'builders', `${pascal}Builder.ts`), builder);
  writeFile(path.join(baseDir, 'configuration', 'validators', `${pascal}Validator.ts`), validator);
}

function generateStatistics(layerName) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const metrics = `export interface ${pascal}Metrics {
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastExecutionTime: number;
  activeOperations: number;
}

export class ${pascal}MetricsCollector {
  private _metrics: ${pascal}Metrics;

  constructor() {
    this._metrics = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0,
      activeOperations: 0,
    };
  }

  recordExecution(durationMs: number, success: boolean): void {
    this._metrics.executionCount++;
    if (success) {
      this._metrics.successCount++;
    } else {
      this._metrics.failureCount++;
    }
    this._metrics.lastExecutionTime = durationMs;
    const totalTime = this._metrics.averageExecutionTime * (this._metrics.executionCount - 1) + durationMs;
    this._metrics.averageExecutionTime = totalTime / this._metrics.executionCount;
  }

  incrementActiveOperations(): void {
    this._metrics.activeOperations++;
  }

  decrementActiveOperations(): void {
    this._metrics.activeOperations = Math.max(0, this._metrics.activeOperations - 1);
  }

  getMetrics(): ${pascal}Metrics {
    return { ...this._metrics };
  }
}
`;

  const index = `export { ${pascal}MetricsCollector } from './${pascal}MetricsCollector';
export type { ${pascal}Metrics } from './${pascal}MetricsCollector';
`;

  writeFile(path.join(baseDir, 'statistics', `${pascal}MetricsCollector.ts`), metrics);
  writeFile(path.join(baseDir, 'statistics', 'index.ts'), index);
}

function generateADR(layerName, position) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const adr = `# ADR: ${pascal} Layer

## Status
Accepted

## Context
The architecture requires a dedicated ${pascal} layer to handle ${kebab.replace(/-/g, ' ')} concerns.

## Decision
Introduce ${pascal} as an isolated layer with interface, implementation, domain model, strategies, factories, configuration, and metrics.

## Consequences
- Improved separation of concerns
- Testable in isolation
- Configurable at runtime
- Adds measurable overhead in terms of file count and lines of code

## Position
${position}
`;

  writeFile(path.join(baseDir, 'docs', 'adr.md'), adr);
}

function deepenLayer(layerName, position) {
  generateStrategies(layerName);
  generateFactories(layerName);
  generateConfiguration(layerName);
  generateStatistics(layerName);
  generateADR(layerName, position);
  console.log(`Deepened layer: ${toKebabCase(layerName)}`);
}

const [, , layerName, position] = process.argv;

if (!layerName) {
  console.error('Usage: node deepen-layer.js <layer-name> [position]');
  process.exit(1);
}

deepenLayer(layerName, position || 'N/A');
