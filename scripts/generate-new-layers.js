#!/usr/bin/env node

/**
 * Generate New Clean Layers
 *
 * Creates full layer structure (interface, implementation, domain, types,
 * configuration, strategies, factories, utils, tests, docs) AND deepens
 * each layer with health check, Prometheus metrics, error class, error mapper.
 */

const fs = require('fs');
const path = require('path');

const LAYERS_DIR = path.join(__dirname, '..', 'src', 'layers');
const REGISTRY_PATH = path.join(__dirname, '..', 'src', 'application', 'LayerRegistry.ts');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
}

function toCamelCase(str) {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function toUpperSnake(str) {
  return str.replace(/-/g, '_').toUpperCase();
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function generateLayer(name, description, position) {
  var kebab = name;
  var pascal = toPascalCase(name);
  var camel = toCamelCase(name);
  var prefix = toUpperSnake(kebab).toLowerCase();
  var baseDir = path.join(LAYERS_DIR, kebab);

  if (fs.existsSync(baseDir)) {
    console.log('SKIP (exists): ' + kebab);
    return;
  }

  var dirs = [
    'interfaces', 'implementations', 'types',
    'domain/entities', 'domain/value-objects', 'domain/services', 'domain/__tests__',
    'configuration/builders', 'configuration/defaults', 'configuration/validators',
    'strategies', 'factories', 'utils', '__tests__', 'docs',
    'health', 'metrics', 'statistics',
  ];
  dirs.forEach(function(d) { fs.mkdirSync(path.join(baseDir, d), { recursive: true }); });

  // Interface
  writeFile(path.join(baseDir, 'interfaces', 'I' + pascal + '.ts'), [
    '/**',
    ' * ' + pascal + ' Interface',
    ' *',
    ' * Defines the contract for the ' + description + ' layer.',
    ' */',
    '',
    'import { ' + pascal + 'Result, ' + pascal + 'Context } from \'../types/' + kebab + '-types\';',
    '',
    'export interface I' + pascal + ' {',
    '  execute(context: ' + pascal + 'Context): Promise<' + pascal + 'Result<unknown>>;',
    '  configure(config: Record<string, unknown>): void;',
    '  getStatus(): Record<string, unknown>;',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'interfaces', 'index.ts'),
    'export { I' + pascal + ' } from \'./I' + pascal + '\';\n');

  // Types
  writeFile(path.join(baseDir, 'types', kebab + '-types.ts'), [
    '/**',
    ' * ' + pascal + ' Types',
    ' */',
    '',
    'export interface ' + pascal + 'Context {',
    '  input: unknown;',
    '  metadata: Record<string, unknown>;',
    '  timestamp: Date;',
    '}',
    '',
    'export interface ' + pascal + 'Error {',
    '  code: string;',
    '  message: string;',
    '  details?: Record<string, unknown>;',
    '}',
    '',
    'export interface ' + pascal + 'Result<T> {',
    '  success: boolean;',
    '  data?: T;',
    '  error?: ' + pascal + 'Error;',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'types', 'index.ts'),
    'export * from \'./' + kebab + '-types\';\n');

  // Implementation
  writeFile(path.join(baseDir, 'implementations', pascal + '.ts'), [
    '/**',
    ' * ' + pascal + ' Implementation',
    ' */',
    '',
    'import { I' + pascal + ' } from \'../interfaces/I' + pascal + '\';',
    'import { ' + pascal + 'Context, ' + pascal + 'Result } from \'../types/' + kebab + '-types\';',
    '',
    'export class ' + pascal + ' implements I' + pascal + ' {',
    '  private _config: Record<string, unknown>;',
    '  private _initialized: boolean;',
    '',
    '  constructor() {',
    '    this._config = {};',
    '    this._initialized = false;',
    '  }',
    '',
    '  async execute(context: ' + pascal + 'Context): Promise<' + pascal + 'Result<unknown>> {',
    '    await Promise.resolve();',
    '    return {',
    '      success: true,',
    '      data: { input: context.input, metadata: context.metadata, layer: \'' + kebab + '\' },',
    '    };',
    '  }',
    '',
    '  configure(config: Record<string, unknown>): void {',
    '    this._config = config;',
    '    this._initialized = true;',
    '  }',
    '',
    '  getStatus(): Record<string, unknown> {',
    '    return {',
    '      layer: \'' + kebab + '\',',
    '      initialized: this._initialized,',
    '      configKeys: Object.keys(this._config),',
    '    };',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'implementations', 'index.ts'),
    'export { ' + pascal + ' } from \'./' + pascal + '\';\n');

  // Domain entity
  writeFile(path.join(baseDir, 'domain', 'entities', pascal + 'Entity.ts'), [
    '/**',
    ' * ' + pascal + ' Entity',
    ' */',
    '',
    'export interface ' + pascal + 'EntityData {',
    '  id: string;',
    '  name: string;',
    '  attributes: Record<string, unknown>;',
    '  createdAt: number;',
    '  updatedAt: number;',
    '}',
    '',
    'export class ' + pascal + 'Entity {',
    '  readonly data: ' + pascal + 'EntityData;',
    '',
    '  private constructor(data: ' + pascal + 'EntityData) {',
    '    this.data = { ...data };',
    '  }',
    '',
    '  static create(name: string, attributes: Record<string, unknown> = {}): ' + pascal + 'Entity {',
    '    const now = Date.now();',
    '    return new ' + pascal + 'Entity({',
    '      id: \'' + kebab + '-\' + now + \'-\' + Math.random().toString(36).slice(2, 8),',
    '      name,',
    '      attributes,',
    '      createdAt: now,',
    '      updatedAt: now,',
    '    });',
    '  }',
    '',
    '  updateAttributes(attrs: Record<string, unknown>): ' + pascal + 'Entity {',
    '    return new ' + pascal + 'Entity({',
    '      ...this.data,',
    '      attributes: { ...this.data.attributes, ...attrs },',
    '      updatedAt: Date.now(),',
    '    });',
    '  }',
    '',
    '  toObject(): ' + pascal + 'EntityData {',
    '    return { ...this.data, attributes: { ...this.data.attributes } };',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'domain', 'entities', 'index.ts'),
    'export { ' + pascal + 'Entity, ' + pascal + 'EntityData } from \'./' + pascal + 'Entity\';\n');

  // Value object
  writeFile(path.join(baseDir, 'domain', 'value-objects', pascal + 'ValueObject.ts'), [
    '/**',
    ' * ' + pascal + ' Value Object',
    ' */',
    '',
    'export class ' + pascal + 'ValueObject {',
    '  readonly value: unknown;',
    '  readonly type: string;',
    '',
    '  private constructor(value: unknown, type: string) {',
    '    this.value = value;',
    '    this.type = type;',
    '  }',
    '',
    '  static create(value: unknown, type: string = \'default\'): ' + pascal + 'ValueObject {',
    '    return new ' + pascal + 'ValueObject(value, type);',
    '  }',
    '',
    '  equals(other: ' + pascal + 'ValueObject): boolean {',
    '    return this.type === other.type && this.value === other.value;',
    '  }',
    '',
    '  toString(): string {',
    '    return String(this.value);',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'domain', 'value-objects', 'index.ts'),
    'export { ' + pascal + 'ValueObject } from \'./' + pascal + 'ValueObject\';\n');

  // Domain service
  writeFile(path.join(baseDir, 'domain', 'services', pascal + 'DomainService.ts'), [
    '/**',
    ' * ' + pascal + ' Domain Service',
    ' */',
    '',
    'import { ' + pascal + 'Entity } from \'../entities/' + pascal + 'Entity\';',
    '',
    'export class ' + pascal + 'DomainService {',
    '  validate(entity: ' + pascal + 'Entity): { valid: boolean; errors: string[] } {',
    '    const errors: string[] = [];',
    '    if (!entity.data.name || entity.data.name.trim().length === 0) {',
    '      errors.push(\'Name is required\');',
    '    }',
    '    return { valid: errors.length === 0, errors };',
    '  }',
    '',
    '  merge(base: ' + pascal + 'Entity, other: ' + pascal + 'Entity): ' + pascal + 'Entity {',
    '    return base.updateAttributes(other.data.attributes);',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'domain', 'services', 'index.ts'),
    'export { ' + pascal + 'DomainService } from \'./' + pascal + 'DomainService\';\n');

  writeFile(path.join(baseDir, 'domain', 'index.ts'), [
    'export * from \'./entities\';',
    'export * from \'./value-objects\';',
    'export * from \'./services\';',
    ''
  ].join('\n'));

  // Configuration
  writeFile(path.join(baseDir, 'configuration', 'builders', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'configuration', 'defaults', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'configuration', 'validators', 'index.ts'), 'export {}\n');
  writeFile(path.join(baseDir, 'configuration', 'index.ts'),
    'export * from "./builders";\nexport * from "./defaults";\nexport * from "./validators";\n');

  // Strategies
  writeFile(path.join(baseDir, 'strategies', 'index.ts'), 'export {}\n');

  // Factories
  writeFile(path.join(baseDir, 'factories', 'index.ts'), 'export {}\n');

  // Statistics
  var metricsCollector = pascal + 'MetricsCollector';
  writeFile(path.join(baseDir, 'statistics', metricsCollector + '.ts'), [
    'export interface ' + pascal + 'Metrics {',
    '  executionCount: number;',
    '  successCount: number;',
    '  failureCount: number;',
    '  averageExecutionTime: number;',
    '  lastExecutionTime: number;',
    '  activeOperations: number;',
    '}',
    '',
    'export class ' + metricsCollector + ' {',
    '  private _metrics: ' + pascal + 'Metrics;',
    '',
    '  constructor() {',
    '    this._metrics = {',
    '      executionCount: 0,',
    '      successCount: 0,',
    '      failureCount: 0,',
    '      averageExecutionTime: 0,',
    '      lastExecutionTime: 0,',
    '      activeOperations: 0,',
    '    };',
    '  }',
    '',
    '  recordExecution(durationMs: number, success: boolean): void {',
    '    this._metrics.executionCount++;',
    '    if (success) { this._metrics.successCount++; } else { this._metrics.failureCount++; }',
    '    this._metrics.lastExecutionTime = durationMs;',
    '    const total = this._metrics.averageExecutionTime * (this._metrics.executionCount - 1) + durationMs;',
    '    this._metrics.averageExecutionTime = total / this._metrics.executionCount;',
    '  }',
    '',
    '  incrementActiveOperations(): void { this._metrics.activeOperations++; }',
    '  decrementActiveOperations(): void { this._metrics.activeOperations = Math.max(0, this._metrics.activeOperations - 1); }',
    '',
    '  getMetrics(): ' + pascal + 'Metrics { return { ...this._metrics }; }',
    '',
    '  reset(): void {',
    '    this._metrics = { executionCount: 0, successCount: 0, failureCount: 0, averageExecutionTime: 0, lastExecutionTime: 0, activeOperations: 0 };',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'statistics', 'index.ts'),
    'export { ' + metricsCollector + ' } from \'./' + metricsCollector + '\';\nexport type { ' + pascal + 'Metrics } from \'./' + metricsCollector + '\';\n');

  // Health check
  var healthClass = pascal + 'HealthCheck';
  writeFile(path.join(baseDir, 'health', healthClass + '.ts'), [
    'import { ' + metricsCollector + ' } from \'../statistics/' + metricsCollector + '\';',
    '',
    'export type ' + pascal + 'HealthStatus = \'healthy\' | \'degraded\' | \'unhealthy\';',
    '',
    'export interface ' + pascal + 'HealthCheckResult {',
    '  status: ' + pascal + 'HealthStatus;',
    '  timestamp: number;',
    '  checks: ' + pascal + 'HealthCheckEntry[];',
    '  summary: string;',
    '}',
    '',
    'export interface ' + pascal + 'HealthCheckEntry {',
    '  name: string;',
    '  status: ' + pascal + 'HealthStatus;',
    '  message: string;',
    '  details?: Record<string, unknown>;',
    '}',
    '',
    'export class ' + healthClass + ' {',
    '  private readonly _collector: ' + metricsCollector + ';',
    '',
    '  constructor(collector: ' + metricsCollector + ') {',
    '    this._collector = collector;',
    '  }',
    '',
    '  check(): ' + pascal + 'HealthCheckResult {',
    '    const checks: ' + pascal + 'HealthCheckEntry[] = [];',
    '    checks.push(this._checkExecutionCount());',
    '    checks.push(this._checkSuccessRate());',
    '    checks.push(this._checkAverageTime());',
    '    const overall = this._aggregateStatus(checks);',
    '    return { status: overall, timestamp: Date.now(), checks, summary: \'' + pascal + ' health: \' + overall };',
    '  }',
    '',
    '  private _checkExecutionCount(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    if (m.executionCount > 0) { return { name: \'execution-count\', status: \'healthy\', message: m.executionCount + \' executions\' }; }',
    '    return { name: \'execution-count\', status: \'degraded\', message: \'No executions recorded\' };',
    '  }',
    '',
    '  private _checkSuccessRate(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    const rate = m.executionCount > 0 ? m.successCount / m.executionCount : 1.0;',
    '    const pct = (rate * 100).toFixed(2) + \'%\';',
    '    if (rate >= 0.95) { return { name: \'success-rate\', status: \'healthy\', message: \'Success rate: \' + pct, details: { rate } }; }',
    '    if (rate >= 0.8) { return { name: \'success-rate\', status: \'degraded\', message: \'Success rate: \' + pct, details: { rate } }; }',
    '    return { name: \'success-rate\', status: \'unhealthy\', message: \'Success rate: \' + pct, details: { rate } };',
    '  }',
    '',
    '  private _checkAverageTime(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    const avg = m.averageExecutionTime;',
    '    const avgStr = avg.toFixed(2) + \'ms\';',
    '    if (avg <= 10) { return { name: \'avg-execution-time\', status: \'healthy\', message: \'Avg: \' + avgStr, details: { avg } }; }',
    '    if (avg <= 50) { return { name: \'avg-execution-time\', status: \'degraded\', message: \'Avg: \' + avgStr, details: { avg } }; }',
    '    return { name: \'avg-execution-time\', status: \'unhealthy\', message: \'Avg: \' + avgStr, details: { avg } };',
    '  }',
    '',
    '  private _aggregateStatus(checks: ' + pascal + 'HealthCheckEntry[]): ' + pascal + 'HealthStatus {',
    '    if (checks.some(function(c) { return c.status === \'unhealthy\'; })) return \'unhealthy\';',
    '    if (checks.some(function(c) { return c.status === \'degraded\'; })) return \'degraded\';',
    '    return \'healthy\';',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'health', 'index.ts'),
    'export { ' + healthClass + ' } from \'./' + healthClass + '\';\nexport type { ' + pascal + 'HealthCheckResult, ' + pascal + 'HealthCheckEntry, ' + pascal + 'HealthStatus } from \'./' + healthClass + '\';\n');

  // Prometheus metrics
  var promClass = pascal + 'PrometheusMetricsCollector';
  writeFile(path.join(baseDir, 'metrics', promClass + '.ts'), [
    'import { ' + metricsCollector + ' } from \'../statistics/' + metricsCollector + '\';',
    '',
    'export interface ' + pascal + 'PrometheusMetrics {',
    '  ' + prefix + '_executions_total: number;',
    '  ' + prefix + '_successful_executions_total: number;',
    '  ' + prefix + '_failed_executions_total: number;',
    '  ' + prefix + '_avg_execution_time_ms: number;',
    '  ' + prefix + '_active_operations: number;',
    '  collectedAt: number;',
    '}',
    '',
    'export interface ' + pascal + 'MetricSample {',
    '  name: string;',
    '  value: number;',
    '  labels: Record<string, string>;',
    '  timestamp: number;',
    '}',
    '',
    'export class ' + promClass + ' {',
    '  private readonly _collector: ' + metricsCollector + ';',
    '  private _collectionCount: number;',
    '',
    '  constructor(collector: ' + metricsCollector + ') {',
    '    this._collector = collector;',
    '    this._collectionCount = 0;',
    '  }',
    '',
    '  collect(): ' + pascal + 'PrometheusMetrics {',
    '    const m = this._collector.getMetrics();',
    '    this._collectionCount++;',
    '    return {',
    '      ' + prefix + '_executions_total: m.executionCount,',
    '      ' + prefix + '_successful_executions_total: m.successCount,',
    '      ' + prefix + '_failed_executions_total: m.failureCount,',
    '      ' + prefix + '_avg_execution_time_ms: m.averageExecutionTime,',
    '      ' + prefix + '_active_operations: m.activeOperations,',
    '      collectedAt: Date.now(),',
    '    };',
    '  }',
    '',
    '  collectAsPrometheusSamples(): ' + pascal + 'MetricSample[] {',
    '    const m = this.collect();',
    '    const ts = m.collectedAt;',
    '    return [',
    '      { name: \'' + prefix + '_executions_total\', value: m.' + prefix + '_executions_total, labels: {}, timestamp: ts },',
    '      { name: \'' + prefix + '_successful_executions_total\', value: m.' + prefix + '_successful_executions_total, labels: {}, timestamp: ts },',
    '      { name: \'' + prefix + '_failed_executions_total\', value: m.' + prefix + '_failed_executions_total, labels: {}, timestamp: ts },',
    '      { name: \'' + prefix + '_avg_execution_time_ms\', value: m.' + prefix + '_avg_execution_time_ms, labels: {}, timestamp: ts },',
    '      { name: \'' + prefix + '_active_operations\', value: m.' + prefix + '_active_operations, labels: {}, timestamp: ts },',
    '    ];',
    '  }',
    '',
    '  toPrometheusString(): string {',
    '    const samples = this.collectAsPrometheusSamples();',
    '    const lines: string[] = [',
    '      \'# HELP ' + prefix + '_executions_total Total executions\',',
    '      \'# TYPE ' + prefix + '_executions_total counter\',',
    '      \'# HELP ' + prefix + '_successful_executions_total Total successful executions\',',
    '      \'# TYPE ' + prefix + '_successful_executions_total counter\',',
    '      \'# HELP ' + prefix + '_failed_executions_total Total failed executions\',',
    '      \'# TYPE ' + prefix + '_failed_executions_total counter\',',
    '      \'# HELP ' + prefix + '_avg_execution_time_ms Average execution time in ms\',',
    '      \'# TYPE ' + prefix + '_avg_execution_time_ms gauge\',',
    '      \'# HELP ' + prefix + '_active_operations Current active operations\',',
    '      \'# TYPE ' + prefix + '_active_operations gauge\',',
    '    ];',
    '    for (const s of samples) { lines.push(s.name + \' \' + s.value + \' \' + s.timestamp); }',
    '    return lines.join(\'\\n\') + \'\\n\';',
    '  }',
    '',
    '  getCollectionCount(): number { return this._collectionCount; }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'metrics', 'index.ts'),
    'export { ' + promClass + ' } from \'./' + promClass + '\';\nexport type { ' + pascal + 'PrometheusMetrics, ' + pascal + 'MetricSample } from \'./' + promClass + '\';\n');

  // Error + ErrorMapper
  var errorClass = pascal + 'Error';
  var mapperClass = pascal + 'ErrorMapper';
  writeFile(path.join(baseDir, 'utils', errorClass + '.ts'), [
    'export class ' + errorClass + ' extends Error {',
    '  readonly code: string;',
    '  readonly statusCode: number;',
    '',
    '  constructor(code: string, message: string, statusCode: number = 500) {',
    '    super(message);',
    '    this.name = \'' + errorClass + '\';',
    '    this.code = code;',
    '    this.statusCode = statusCode;',
    '    if (typeof Error.captureStackTrace === \'function\') {',
    '      Error.captureStackTrace(this, this.constructor);',
    '    }',
    '  }',
    '',
    '  static executionFailed(message: string = \'' + pascal + ' execution failed\'): ' + errorClass + ' {',
    '    return new ' + errorClass + '(\'EXECUTION_FAILED\', message, 500);',
    '  }',
    '',
    '  static configurationError(message: string = \'Invalid ' + kebab + ' configuration\'): ' + errorClass + ' {',
    '    return new ' + errorClass + '(\'CONFIGURATION_ERROR\', message, 400);',
    '  }',
    '',
    '  static notFound(message: string = \'' + pascal + ' resource not found\'): ' + errorClass + ' {',
    '    return new ' + errorClass + '(\'NOT_FOUND\', message, 404);',
    '  }',
    '',
    '  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {',
    '    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };',
    '  }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'utils', mapperClass + '.ts'), [
    'import { ' + errorClass + ' } from \'./' + errorClass + '\';',
    '',
    'export interface Mapped' + pascal + 'Error {',
    '  code: string;',
    '  message: string;',
    '  statusCode: number;',
    '  retryable: boolean;',
    '}',
    '',
    'export class ' + mapperClass + ' {',
    '  private static readonly _retryableCodes: Set<string> = new Set([\'EXECUTION_FAILED\', \'TIMEOUT\']);',
    '',
    '  static map(error: Error | ' + errorClass + '): Mapped' + pascal + 'Error {',
    '    if (error instanceof ' + errorClass + ') {',
    '      return { code: error.code, message: error.message, statusCode: error.statusCode, retryable: this._retryableCodes.has(error.code) };',
    '    }',
    '    return { code: \'INTERNAL_ERROR\', message: error.message || \'An unexpected ' + kebab + ' error occurred\', statusCode: 500, retryable: false };',
    '  }',
    '',
    '  static isRetryable(error: Error | ' + errorClass + '): boolean { return this.map(error).retryable; }',
    '  static registerRetryableCode(code: string): void { this._retryableCodes.add(code); }',
    '}',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'utils', 'index.ts'),
    'export { ' + errorClass + ' } from \'./' + errorClass + '\';\nexport { ' + mapperClass + ', Mapped' + pascal + 'Error } from \'./' + mapperClass + '\';\n');

  // Tests
  writeFile(path.join(baseDir, '__tests__', pascal + '.test.ts'), [
    'import { ' + pascal + ' } from \'../implementations/' + pascal + '\';',
    'import { ' + pascal + 'Context } from \'../types/' + kebab + '-types\';',
    '',
    'function createContext(input: unknown): ' + pascal + 'Context {',
    '  return { input, metadata: {}, timestamp: new Date() };',
    '}',
    '',
    'describe(\'' + pascal + '\', () => {',
    '  let instance: ' + pascal + ';',
    '',
    '  beforeEach(() => { instance = new ' + pascal + '(); });',
    '',
    '  it(\'should execute successfully\', async () => {',
    '    const result = await instance.execute(createContext(\'test\'));',
    '    expect(result.success).toBe(true);',
    '  });',
    '',
    '  it(\'should configure\', () => {',
    '    instance.configure({ key: \'value\' });',
    '    const status = instance.getStatus();',
    '    expect(status.initialized).toBe(true);',
    '  });',
    '',
    '  it(\'should return status\', () => {',
    '    const status = instance.getStatus();',
    '    expect(status.layer).toBe(\'' + kebab + '\');',
    '  });',
    '});',
    ''
  ].join('\n'));

  writeFile(path.join(baseDir, 'domain', '__tests__', pascal + 'Domain.test.ts'), [
    'import { ' + pascal + 'Entity } from \'../entities/' + pascal + 'Entity\';',
    'import { ' + pascal + 'ValueObject } from \'../value-objects/' + pascal + 'ValueObject\';',
    'import { ' + pascal + 'DomainService } from \'../services/' + pascal + 'DomainService\';',
    '',
    'describe(\'' + pascal + 'Entity\', () => {',
    '  it(\'should create entity\', () => {',
    '    const entity = ' + pascal + 'Entity.create(\'test\');',
    '    expect(entity.data.name).toBe(\'test\');',
    '    expect(entity.data.id).toBeDefined();',
    '  });',
    '',
    '  it(\'should update attributes immutably\', () => {',
    '    const entity = ' + pascal + 'Entity.create(\'test\');',
    '    const updated = entity.updateAttributes({ key: \'value\' });',
    '    expect(updated.data.attributes.key).toBe(\'value\');',
    '    expect(entity.data.attributes.key).toBeUndefined();',
    '  });',
    '});',
    '',
    'describe(\'' + pascal + 'ValueObject\', () => {',
    '  it(\'should create value object\', () => {',
    '    const vo = ' + pascal + 'ValueObject.create(\'test\', \'string\');',
    '    expect(vo.value).toBe(\'test\');',
    '    expect(vo.type).toBe(\'string\');',
    '  });',
    '',
    '  it(\'should compare equality\', () => {',
    '    const a = ' + pascal + 'ValueObject.create(\'test\', \'string\');',
    '    const b = ' + pascal + 'ValueObject.create(\'test\', \'string\');',
    '    const c = ' + pascal + 'ValueObject.create(\'other\', \'string\');',
    '    expect(a.equals(b)).toBe(true);',
    '    expect(a.equals(c)).toBe(false);',
    '  });',
    '});',
    '',
    'describe(\'' + pascal + 'DomainService\', () => {',
    '  let service: ' + pascal + 'DomainService;',
    '',
    '  beforeEach(() => { service = new ' + pascal + 'DomainService(); });',
    '',
    '  it(\'should validate entity\', () => {',
    '    const valid = ' + pascal + 'Entity.create(\'test\');',
    '    expect(service.validate(valid).valid).toBe(true);',
    '  });',
    '',
    '  it(\'should reject empty name\', () => {',
    '    const invalid = ' + pascal + 'Entity.create(\'\');',
    '    expect(service.validate(invalid).valid).toBe(false);',
    '  });',
    '});',
    ''
  ].join('\n'));

  // Docs
  writeFile(path.join(baseDir, 'docs', kebab + '-layer-architecture.md'), [
    '# ' + pascal + ' Layer',
    '',
    '## Responsibility',
    description,
    '',
    '## Position',
    position,
    '',
    '## Components',
    '- **I' + pascal + '**: Interface defining the layer contract.',
    '- **' + pascal + '**: Concrete implementation.',
    '- **' + pascal + 'Entity**: Core domain entity.',
    '- **' + pascal + 'ValueObject**: Immutable value object.',
    '- **' + pascal + 'DomainService**: Domain logic.',
    '- **' + pascal + 'HealthCheck**: Health check with execution/success/time checks.',
    '- **' + pascal + 'PrometheusMetricsCollector**: Prometheus-compatible metrics export.',
    '- **' + errorClass + '** / **' + mapperClass + '**: Error taxonomy and mapping.',
    ''
  ].join('\n'));

  // Layer index
  writeFile(path.join(baseDir, 'index.ts'), [
    'export * from \'./interfaces\';',
    'export * from \'./implementations\';',
    'export * from \'./types\';',
    'export * from \'./domain\';',
    'export * from \'./health\';',
    'export * from \'./metrics\';',
    'export * from \'./statistics\';',
    'export * from \'./utils\';',
    ''
  ].join('\n'));

  console.log('Generated: ' + kebab + ' (' + pascal + ')');
}

// Layer definitions
var layers = [
  // Task 4.1: Product & operations
  ['multi-tenancy', 'Multi-tenant context and isolation strategies', 'Product Layer 1'],
  ['notification', 'Email, SMS, and push notification abstractions', 'Product Layer 2'],
  ['billing', 'Usage metering, plan limits, and invoicing', 'Product Layer 3'],
  ['onboarding', 'User onboarding flows and step tracking', 'Product Layer 4'],
  // Task 4.2: Data & search
  ['search', 'Full-text and vector search abstractions', 'Data Layer 1'],
  ['reporting', 'Report generation and export in multiple formats', 'Data Layer 2'],
  ['data-lineage', 'Data flow tracking and lineage graph', 'Data Layer 3'],
  ['governance', 'Policies, compliance rules, and audit governance', 'Data Layer 4'],
  // Task 4.3: ML & intelligence
  ['recommendation', 'Recommendation engine with collaborative and content filtering', 'ML Layer 1'],
  ['ml-feature-store', 'ML feature storage, serving, and versioning', 'ML Layer 2'],
  ['anomaly-detection', 'Anomaly detection with statistical and ML methods', 'ML Layer 3'],
  // Task 4.4: Infrastructure & reliability
  ['api-versioning', 'API version negotiation and deprecation management', 'Infra Layer 1'],
  ['localization', 'Internationalization and locale management', 'Infra Layer 2'],
  ['scheduling', 'Cron-based and event-driven job scheduling', 'Infra Layer 3'],
  ['batch-processing', 'Batch orchestration and chunk processing', 'Infra Layer 4'],
  ['cdn-integration', 'CDN purge, invalidation, and cache management', 'Infra Layer 5'],
  ['secrets-rotation', 'Automated secret rotation and lifecycle management', 'Infra Layer 6'],
  ['cost-optimization', 'FinOps resource optimization and cost tracking', 'Infra Layer 7'],
  ['disaster-recovery', 'DR drills, failover, and recovery orchestration', 'Infra Layer 8'],
];

console.log('Generating ' + layers.length + ' new layers...\n');

for (var i = 0; i < layers.length; i++) {
  generateLayer(layers[i][0], layers[i][1], layers[i][2]);
}

console.log('\nDone. Generated ' + layers.length + ' layers.');
