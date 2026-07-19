#!/usr/bin/env node

/**
 * Deepen Horizontal Layers
 *
 * Generates health check, Prometheus metrics collector, error class,
 * and error mapper for each horizontal layer that doesn't have them yet.
 */

const fs = require('fs');
const path = require('path');

const LAYERS_DIR = path.join(__dirname, '..', 'src', 'layers');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, char) => char.toUpperCase());
}

function toUpperSnake(str) {
  return str.replace(/-/g, '_').toUpperCase();
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function findMetricsCollector(layerDir, pascal) {
  const statsDir = path.join(layerDir, 'statistics');
  if (!fs.existsSync(statsDir)) return null;

  const expected = pascal + 'MetricsCollector.ts';
  const expectedPath = path.join(statsDir, expected);
  if (fs.existsSync(expectedPath)) return expected;

  const files = fs.readdirSync(statsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');
  if (files.length > 0) return files[0];
  return null;
}

function generateGenericMetricsCollector(layerDir, pascal) {
  var className = pascal + 'MetricsCollector';
  var metricsInterface = pascal + 'Metrics';

  var content = [
    'export interface ' + metricsInterface + ' {',
    '  executionCount: number;',
    '  successCount: number;',
    '  failureCount: number;',
    '  averageExecutionTime: number;',
    '  lastExecutionTime: number;',
    '  activeOperations: number;',
    '}',
    '',
    'export class ' + className + ' {',
    '  private _metrics: ' + metricsInterface + ';',
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
    '    if (success) {',
    '      this._metrics.successCount++;',
    '    } else {',
    '      this._metrics.failureCount++;',
    '    }',
    '    this._metrics.lastExecutionTime = durationMs;',
    '    const totalTime = this._metrics.averageExecutionTime * (this._metrics.executionCount - 1) + durationMs;',
    '    this._metrics.averageExecutionTime = totalTime / this._metrics.executionCount;',
    '  }',
    '',
    '  incrementActiveOperations(): void {',
    '    this._metrics.activeOperations++;',
    '  }',
    '',
    '  decrementActiveOperations(): void {',
    '    this._metrics.activeOperations = Math.max(0, this._metrics.activeOperations - 1);',
    '  }',
    '',
    '  getMetrics(): ' + metricsInterface + ' {',
    '    return { ...this._metrics };',
    '  }',
    '',
    '  reset(): void {',
    '    this._metrics = {',
    '      executionCount: 0,',
    '      successCount: 0,',
    '      failureCount: 0,',
    '      averageExecutionTime: 0,',
    '      lastExecutionTime: 0,',
    '      activeOperations: 0,',
    '    };',
    '  }',
    '}',
    ''
  ].join('\n');

  var indexContent = [
    'export { ' + className + ' } from \'./' + className + '\';',
    'export type { ' + metricsInterface + ' } from \'./' + className + '\';',
    ''
  ].join('\n');

  writeFile(path.join(layerDir, 'statistics', className + '.ts'), content);
  writeFile(path.join(layerDir, 'statistics', 'index.ts'), indexContent);
}

function generateHealthCheck(layerDir, pascal) {
  var collectorClass = pascal + 'MetricsCollector';
  var healthClass = pascal + 'HealthCheck';

  var content = [
    'import { ' + collectorClass + ' } from \'../statistics/' + collectorClass + '\';',
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
    '  private readonly _collector: ' + collectorClass + ';',
    '',
    '  constructor(collector: ' + collectorClass + ') {',
    '    this._collector = collector;',
    '  }',
    '',
    '  check(): ' + pascal + 'HealthCheckResult {',
    '    const checks: ' + pascal + 'HealthCheckEntry[] = [];',
    '',
    '    checks.push(this._checkExecutionCount());',
    '    checks.push(this._checkSuccessRate());',
    '    checks.push(this._checkAverageTime());',
    '',
    '    const overall = this._aggregateStatus(checks);',
    '',
    '    return {',
    '      status: overall,',
    '      timestamp: Date.now(),',
    '      checks,',
    '      summary: \'' + pascal + ' health: \' + overall,',
    '    };',
    '  }',
    '',
    '  private _checkExecutionCount(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    if (m.executionCount > 0) {',
    '      return { name: \'execution-count\', status: \'healthy\', message: m.executionCount + \' executions\' };',
    '    }',
    '    return { name: \'execution-count\', status: \'degraded\', message: \'No executions recorded\' };',
    '  }',
    '',
    '  private _checkSuccessRate(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    const rate = m.executionCount > 0 ? m.successCount / m.executionCount : 1.0;',
    '    const pct = (rate * 100).toFixed(2) + \'%\';',
    '    if (rate >= 0.95) {',
    '      return { name: \'success-rate\', status: \'healthy\', message: \'Success rate: \' + pct, details: { rate } };',
    '    }',
    '    if (rate >= 0.8) {',
    '      return { name: \'success-rate\', status: \'degraded\', message: \'Success rate: \' + pct, details: { rate } };',
    '    }',
    '    return { name: \'success-rate\', status: \'unhealthy\', message: \'Success rate: \' + pct, details: { rate } };',
    '  }',
    '',
    '  private _checkAverageTime(): ' + pascal + 'HealthCheckEntry {',
    '    const m = this._collector.getMetrics();',
    '    const avg = m.averageExecutionTime;',
    '    const avgStr = avg.toFixed(2) + \'ms\';',
    '    if (avg <= 10) {',
    '      return { name: \'avg-execution-time\', status: \'healthy\', message: \'Avg: \' + avgStr, details: { avg } };',
    '    }',
    '    if (avg <= 50) {',
    '      return { name: \'avg-execution-time\', status: \'degraded\', message: \'Avg: \' + avgStr, details: { avg } };',
    '    }',
    '    return { name: \'avg-execution-time\', status: \'unhealthy\', message: \'Avg: \' + avgStr, details: { avg } };',
    '  }',
    '',
    '  private _aggregateStatus(checks: ' + pascal + 'HealthCheckEntry[]): ' + pascal + 'HealthStatus {',
    '    if (checks.some((c) => c.status === \'unhealthy\')) return \'unhealthy\';',
    '    if (checks.some((c) => c.status === \'degraded\')) return \'degraded\';',
    '    return \'healthy\';',
    '  }',
    '}',
    ''
  ].join('\n');

  var indexContent = [
    'export { ' + healthClass + ' } from \'./' + healthClass + '\';',
    'export type { ' + pascal + 'HealthCheckResult, ' + pascal + 'HealthCheckEntry, ' + pascal + 'HealthStatus } from \'./' + healthClass + '\';',
    ''
  ].join('\n');

  writeFile(path.join(layerDir, 'health', healthClass + '.ts'), content);
  writeFile(path.join(layerDir, 'health', 'index.ts'), indexContent);
}

function generatePrometheusMetrics(layerDir, pascal, kebab) {
  var collectorClass = pascal + 'MetricsCollector';
  var promClass = pascal + 'PrometheusMetricsCollector';
  var prefix = toUpperSnake(kebab).toLowerCase();

  var content = [
    'import { ' + collectorClass + ' } from \'../statistics/' + collectorClass + '\';',
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
    '  private readonly _collector: ' + collectorClass + ';',
    '  private _collectionCount: number;',
    '',
    '  constructor(collector: ' + collectorClass + ') {',
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
    '',
    '    for (const s of samples) {',
    '      lines.push(s.name + \' \' + s.value + \' \' + s.timestamp);',
    '    }',
    '',
    '    return lines.join(\'\\n\') + \'\\n\';',
    '  }',
    '',
    '  getCollectionCount(): number {',
    '    return this._collectionCount;',
    '  }',
    '}',
    ''
  ].join('\n');

  var indexContent = [
    'export { ' + promClass + ' } from \'./' + promClass + '\';',
    'export type { ' + pascal + 'PrometheusMetrics, ' + pascal + 'MetricSample } from \'./' + promClass + '\';',
    ''
  ].join('\n');

  writeFile(path.join(layerDir, 'metrics', promClass + '.ts'), content);
  writeFile(path.join(layerDir, 'metrics', 'index.ts'), indexContent);
}

function generateErrorAndMapper(layerDir, pascal, kebab) {
  var errorClass = pascal + 'Error';
  var mapperClass = pascal + 'ErrorMapper';

  var errorContent = [
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
    '    return {',
    '      name: this.name,',
    '      code: this.code,',
    '      message: this.message,',
    '      statusCode: this.statusCode,',
    '      stack: this.stack,',
    '    };',
    '  }',
    '}',
    ''
  ].join('\n');

  var mapperContent = [
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
    '      return {',
    '        code: error.code,',
    '        message: error.message,',
    '        statusCode: error.statusCode,',
    '        retryable: this._retryableCodes.has(error.code),',
    '      };',
    '    }',
    '',
    '    return {',
    '      code: \'INTERNAL_ERROR\',',
    '      message: error.message || \'An unexpected ' + kebab + ' error occurred\',',
    '      statusCode: 500,',
    '      retryable: false,',
    '    };',
    '  }',
    '',
    '  static isRetryable(error: Error | ' + errorClass + '): boolean {',
    '    return this.map(error).retryable;',
    '  }',
    '',
    '  static registerRetryableCode(code: string): void {',
    '    this._retryableCodes.add(code);',
    '  }',
    '}',
    ''
  ].join('\n');

  writeFile(path.join(layerDir, 'utils', errorClass + '.ts'), errorContent);
  writeFile(path.join(layerDir, 'utils', mapperClass + '.ts'), mapperContent);

  // Update utils/index.ts
  var utilsIndexPath = path.join(layerDir, 'utils', 'index.ts');
  var utilsIndex = '';
  if (fs.existsSync(utilsIndexPath)) {
    utilsIndex = fs.readFileSync(utilsIndexPath, 'utf8');
  }

  var exportError = 'export { ' + errorClass + ' } from \'./' + errorClass + '\';';
  var exportMapper = 'export { ' + mapperClass + ', Mapped' + pascal + 'Error } from \'./' + mapperClass + '\';';

  if (utilsIndex.indexOf(exportError) === -1) {
    utilsIndex = utilsIndex.trimEnd() + '\n' + exportError + '\n';
  }
  if (utilsIndex.indexOf(exportMapper) === -1) {
    utilsIndex = utilsIndex.trimEnd() + '\n' + exportMapper + '\n';
  }

  writeFile(utilsIndexPath, utilsIndex);
}

function deepenLayer(layerName) {
  var pascal = toPascalCase(layerName);
  var kebab = layerName;
  var layerDir = path.join(LAYERS_DIR, layerName);

  if (!fs.existsSync(layerDir)) {
    console.error('Layer not found: ' + layerName);
    return;
  }

  if (fs.existsSync(path.join(layerDir, 'health'))) {
    console.log('SKIP (already deepened): ' + layerName);
    return;
  }

  var statsFile = findMetricsCollector(layerDir, pascal);
  if (!statsFile) {
    generateGenericMetricsCollector(layerDir, pascal);
    console.log('  Created generic MetricsCollector');
  }

  generateHealthCheck(layerDir, pascal);
  console.log('  Created HealthCheck');

  generatePrometheusMetrics(layerDir, pascal, kebab);
  console.log('  Created PrometheusMetricsCollector');

  generateErrorAndMapper(layerDir, pascal, kebab);
  console.log('  Created Error + ErrorMapper');

  console.log('Deepened: ' + layerName);
}

var allLayers = fs.readdirSync(LAYERS_DIR).filter(function(f) {
  return fs.statSync(path.join(LAYERS_DIR, f)).isDirectory();
});

var layersToDeepen = allLayers.filter(function(name) {
  var layerDir = path.join(LAYERS_DIR, name);
  return !fs.existsSync(path.join(layerDir, 'health'));
});

console.log('Found ' + layersToDeepen.length + ' layers to deepen:\n');

for (var i = 0; i < layersToDeepen.length; i++) {
  deepenLayer(layersToDeepen[i]);
}

console.log('\nDone. Deepened ' + layersToDeepen.length + ' layers.');
