#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, char) => char.toUpperCase());
}

function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function generateLayer(layerName, description, position) {
  const kebab = toKebabCase(layerName);
  const pascal = toPascalCase(layerName);
  const camel = toCamelCase(layerName);
  const baseDir = path.join(__dirname, '..', 'src', 'layers', kebab);

  const dirs = [
    'interfaces',
    'implementations',
    'types',
    'domain/entities',
    'domain/value-objects',
    'domain/services',
    'domain/__tests__',
    'configuration/builders',
    'configuration/defaults',
    'configuration/validators',
    'strategies',
    'factories',
    'utils',
    '__tests__',
    'docs',
  ];

  dirs.forEach((dir) => ensureDir(path.join(baseDir, dir)));

  const interfaceContent = `/**
 * ${pascal} Interface
 *
 * Defines the contract for the ${description} layer.
 */

import { ${pascal}Result, ${pascal}Context } from '../types/${kebab}-types';

export interface I${pascal} {
  /**
   * Execute the ${camel} operation
   */
  execute(context: ${pascal}Context): Promise<${pascal}Result<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
`;

  const implementationContent = `/**
 * ${pascal} Implementation
 *
 * Concrete implementation of I${pascal}.
 * Handles ${description}.
 */

import { I${pascal} } from '../interfaces/I${pascal}';
import { ${pascal}Result, ${pascal}Context } from '../types/${kebab}-types';

export class ${pascal} implements I${pascal} {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: ${pascal}Context): Promise<${pascal}Result<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return { success: true, data: output };
    } catch (error) {
      this._recordMetric('failureCount', 1);
      return {
        success: false,
        error: {
          code: '${pascal.toUpperCase()}_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: ${pascal}Context): unknown {
    return { processed: true, context, layer: '${pascal}' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) || 0;
    this._metrics.set(name, current + delta);
  }
}
`;

  const typesContent = `/**
 * ${pascal} Types
 *
 * Type definitions for the ${description} layer.
 */

export interface ${pascal}Context {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ${pascal}Error {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ${pascal}Result<T> {
  success: boolean;
  data?: T;
  error?: ${pascal}Error;
}

export interface ${pascal}Config {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
`;

  const indexContent = `/**
 * ${pascal} Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the ${pascal} Layer (${position} of the architecture).
 */

export { I${pascal} } from './interfaces/I${pascal}';
export { ${pascal} } from './implementations/${pascal}';
export * from './types/${kebab}-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
`;

  const domainIndexContent = `/**
 * ${pascal} Domain Layer
 */

export * from './entities';
export * from './value-objects';
export * from './services';
`;

  const entitiesIndexContent = `/**
 * ${pascal} Domain Entities
 */

export { ${pascal}Entity } from './${pascal}Entity';
`;

  const entityContent = `/**
 * ${pascal} Entity
 *
 * Core domain entity for the ${description} layer.
 */

export class ${pascal}Entity {
  readonly id: string;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.id = id;
    this.createdAt = new Date();
    this.data = { ...data };
  }

  static create(data: Record<string, unknown>): ${pascal}Entity {
    return new ${pascal}Entity(
      \`${kebab}-\${Date.now()}-\${Math.random().toString(36).substring(2, 8)}\`,
      data
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      data: this.data,
    };
  }
}
`;

  const valueObjectsIndexContent = `/**
 * ${pascal} Domain Value Objects
 */

export { ${pascal}ValueObject } from './${pascal}ValueObject';
`;

  const valueObjectContent = `/**
 * ${pascal} Value Object
 *
 * Immutable value object for the ${description} layer.
 */

export class ${pascal}ValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('${pascal} value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ${pascal}ValueObject {
    return new ${pascal}ValueObject(value);
  }

  equals(other: ${pascal}ValueObject): boolean {
    return other instanceof ${pascal}ValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
`;

  const servicesIndexContent = `/**
 * ${pascal} Domain Services
 */

export { ${pascal}DomainService } from './${pascal}DomainService';
`;

  const domainServiceContent = `/**
 * ${pascal} Domain Service
 *
 * Domain service for ${description} operations.
 */

export class ${pascal}DomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: '${pascal}DomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
`;

  const testContent = `/**
 * ${pascal} Unit Tests
 */

import { ${pascal} } from '../implementations/${pascal}';

describe('${pascal}', () => {
  it('should execute successfully', async () => {
    const layer = new ${pascal}();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ${pascal}();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ${pascal}();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
`;

  const domainTestContent = `/**
 * ${pascal} Domain Entity Tests
 */

import { ${pascal}Entity } from '../entities/${pascal}Entity';
import { ${pascal}ValueObject } from '../value-objects/${pascal}ValueObject';
import { ${pascal}DomainService } from '../services/${pascal}DomainService';

describe('${pascal} Domain', () => {
  it('should create entity', () => {
    const entity = ${pascal}Entity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ${pascal}ValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ${pascal}DomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
`;

  const docsContent = `# ${pascal} Layer Architecture

## Position
${position}

## Responsibility
${description}

## Components
- **I${pascal}**: Interface defining the layer contract.
- **${pascal}**: Concrete implementation.
- **${pascal}Entity**: Core domain entity.
- **${pascal}ValueObject**: Immutable value object.
- **${pascal}DomainService**: Domain logic.

## Integration
This layer receives input from the previous layer and delegates to the next layer through a well-defined interface.

## Testing
- Unit tests for implementation
- Domain tests for entities and value objects
- Integration tests with adjacent layers (planned)
`;

  writeFile(path.join(baseDir, 'interfaces', `I${pascal}.ts`), interfaceContent);
  writeFile(path.join(baseDir, 'implementations', `${pascal}.ts`), implementationContent);
  writeFile(path.join(baseDir, 'types', `${kebab}-types.ts`), typesContent);
  writeFile(path.join(baseDir, 'index.ts'), indexContent);

  writeFile(path.join(baseDir, 'domain', 'index.ts'), domainIndexContent);
  writeFile(path.join(baseDir, 'domain', 'entities', 'index.ts'), entitiesIndexContent);
  writeFile(path.join(baseDir, 'domain', 'entities', `${pascal}Entity.ts`), entityContent);
  writeFile(path.join(baseDir, 'domain', 'value-objects', 'index.ts'), valueObjectsIndexContent);
  writeFile(path.join(baseDir, 'domain', 'value-objects', `${pascal}ValueObject.ts`), valueObjectContent);
  writeFile(path.join(baseDir, 'domain', 'services', 'index.ts'), servicesIndexContent);
  writeFile(path.join(baseDir, 'domain', 'services', `${pascal}DomainService.ts`), domainServiceContent);

  writeFile(path.join(baseDir, 'configuration', 'builders', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'configuration', 'defaults', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'configuration', 'validators', 'index.ts'), 'export {}\n');
  writeFile(
    path.join(baseDir, 'configuration', 'index.ts'),
    'export * from "./builders";\nexport * from "./defaults";\nexport * from "./validators";\n'
  );
  writeFile(path.join(baseDir, 'strategies', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'factories', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'utils', 'index.ts'), 'export {}\n');

  writeFile(path.join(baseDir, '__tests__', `${pascal}.test.ts`), testContent);
  writeFile(path.join(baseDir, 'domain', '__tests__', `${pascal}Domain.test.ts`), domainTestContent);
  writeFile(path.join(baseDir, 'docs', `${kebab}-layer-architecture.md`), docsContent);

  console.log(`Generated layer: ${kebab} (${pascal})`);
}

const [, , layerName, description, position] = process.argv;

if (!layerName || !description || !position) {
  console.error('Usage: node generate-layer.js <layer-name> <description> <position>');
  console.error('Example: node generate-layer.js api-gateway "API gateway abstraction" "Layer 26"');
  process.exit(1);
}

generateLayer(layerName, description, position);
