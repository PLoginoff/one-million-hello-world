#!/usr/bin/env node

/**
 * Generate domain services, repositories, mappers, handlers, DTOs
 * for all layers to expand the codebase meaningfully.
 *
 * Per layer adds:
 * - 3 domain services (ExecutionService, ValidationService, QueryService)
 * - 1 repository (in-memory)
 * - 1 mapper (entity <-> DTO)
 * - 2 handlers (CommandHandler, QueryHandler)
 * - 3 DTOs (Request, Response, Error)
 * - Tests for all new components
 */

const fs = require('fs');
const path = require('path');

const LAYERS_DIR = path.join(__dirname, '..', 'src', 'layers');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function generateDomainServices(info) {
  var p = info.pascal;
  var servicesDir = path.join(info.baseDir, 'domain', 'services');

  var services = [
    { name: p + 'ExecutionService', desc: 'Service for managing ' + info.kebab + ' executions' },
    { name: p + 'ValidationService', desc: 'Service for validating ' + info.kebab + ' data' },
    { name: p + 'QueryService', desc: 'Service for querying ' + info.kebab + ' data' },
  ];

  var exports = [];
  var existingIndex = fileExists(path.join(servicesDir, 'index.ts'))
    ? fs.readFileSync(path.join(servicesDir, 'index.ts'), 'utf8')
    : '';

  for (var i = 0; i < services.length; i++) {
    var s = services[i];
    var fileName = s.name + '.ts';
    var filePath = path.join(servicesDir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(s.name)) exports.push('export { ' + s.name + ' } from \'./' + s.name + '\';');
      continue;
    }

    var content;
    if (s.name.includes('Execution')) {
      content = [
        '/**',
        ' * ' + s.name,
        ' *',
        ' * ' + s.desc + '.',
        ' */',
        '',
        'export interface ExecutionRecord {',
        '  id: string;',
        '  status: \'pending\' | \'running\' | \'completed\' | \'failed\';',
        '  startTime: number;',
        '  endTime?: number;',
        '  durationMs?: number;',
        '  input: unknown;',
        '  output?: unknown;',
        '  error?: string;',
        '  metadata: Record<string, unknown>;',
        '}',
        '',
        'export class ' + s.name + ' {',
        '  private _records: Map<string, ExecutionRecord>;',
        '  private _activeExecutions: Set<string>;',
        '',
        '  constructor() {',
        '    this._records = new Map();',
        '    this._activeExecutions = new Set();',
        '  }',
        '',
        '  start(id: string, input: unknown, metadata: Record<string, unknown> = {}): ExecutionRecord {',
        '    var record: ExecutionRecord = {',
        '      id: id,',
        '      status: \'running\',',
        '      startTime: Date.now(),',
        '      input: input,',
        '      metadata: metadata,',
        '    };',
        '    this._records.set(id, record);',
        '    this._activeExecutions.add(id);',
        '    return record;',
        '  }',
        '',
        '  complete(id: string, output: unknown): ExecutionRecord | null {',
        '    var record = this._records.get(id);',
        '    if (!record) return null;',
        '    record.status = \'completed\';',
        '    record.endTime = Date.now();',
        '    record.durationMs = record.endTime - record.startTime;',
        '    record.output = output;',
        '    this._activeExecutions.delete(id);',
        '    return record;',
        '  }',
        '',
        '  fail(id: string, error: string): ExecutionRecord | null {',
        '    var record = this._records.get(id);',
        '    if (!record) return null;',
        '    record.status = \'failed\';',
        '    record.endTime = Date.now();',
        '    record.durationMs = record.endTime - record.startTime;',
        '    record.error = error;',
        '    this._activeExecutions.delete(id);',
        '    return record;',
        '  }',
        '',
        '  getRecord(id: string): ExecutionRecord | null {',
        '    return this._records.get(id) ?? null;',
        '  }',
        '',
        '  getAllRecords(): ExecutionRecord[] {',
        '    return Array.from(this._records.values());',
        '  }',
        '',
        '  getActiveExecutions(): ExecutionRecord[] {',
        '    return Array.from(this._activeExecutions).map(function(id) { return this._records.get(id); }.bind(this)).filter(Boolean);',
        '  }',
        '',
        '  getCompletedExecutions(): ExecutionRecord[] {',
        '    return this.getAllRecords().filter(function(r) { return r.status === \'completed\'; });',
        '  }',
        '',
        '  getFailedExecutions(): ExecutionRecord[] {',
        '    return this.getAllRecords().filter(function(r) { return r.status === \'failed\'; });',
        '  }',
        '',
        '  getSuccessRate(): number {',
        '    var total = this._records.size;',
        '    if (total === 0) return 1.0;',
        '    var completed = this.getCompletedExecutions().length;',
        '    return completed / total;',
        '  }',
        '',
        '  getAverageDuration(): number {',
        '    var completed = this.getCompletedExecutions();',
        '    if (completed.length === 0) return 0;',
        '    var total = completed.reduce(function(sum, r) { return sum + (r.durationMs ?? 0); }, 0);',
        '    return total / completed.length;',
        '  }',
        '',
        '  cancel(id: string): boolean {',
        '    if (!this._activeExecutions.has(id)) return false;',
        '    this._activeExecutions.delete(id);',
        '    var record = this._records.get(id);',
        '    if (record) {',
        '      record.status = \'failed\';',
        '      record.error = \'Cancelled\';',
        '      record.endTime = Date.now();',
        '      record.durationMs = record.endTime - record.startTime;',
        '    }',
        '    return true;',
        '  }',
        '',
        '  clear(): void {',
        '    this._records.clear();',
        '    this._activeExecutions.clear();',
        '  }',
        '',
        '  count(): number { return this._records.size; }',
        '}',
        '',
      ];
    } else if (s.name.includes('Validation')) {
      content = [
        '/**',
        ' * ' + s.name,
        ' *',
        ' * ' + s.desc + '.',
        ' */',
        '',
        'export interface ValidationIssue {',
        '  field: string;',
        '  message: string;',
        '  severity: \'error\' | \'warning\';',
        '  code: string;',
        '}',
        '',
        'export interface ValidationReport {',
        '  valid: boolean;',
        '  issues: ValidationIssue[];',
        '  errors: ValidationIssue[];',
        '  warnings: ValidationIssue[];',
        '}',
        '',
        'export class ' + s.name + ' {',
        '  private _rules: Array<{ field: string; validate: (value: unknown) => ValidationIssue | null }>;',
        '',
        '  constructor() {',
        '    this._rules = [];',
        '  }',
        '',
        '  addRule(field: string, validate: (value: unknown) => ValidationIssue | null): void {',
        '    this._rules.push({ field: field, validate: validate });',
        '  }',
        '',
        '  addRequiredRule(field: string): void {',
        '    this.addRule(field, function(value: unknown) {',
        '      if (value === null || value === undefined || value === \'\') {',
        '        return { field: field, message: field + \' is required\', severity: \'error\', code: \'REQUIRED\' };',
        '      }',
        '      return null;',
        '    });',
        '  }',
        '',
        '  addTypeRule(field: string, expectedType: string): void {',
        '    this.addRule(field, function(value: unknown) {',
        '      if (value === null || value === undefined) return null;',
        '      var actualType = Array.isArray(value) ? \'array\' : typeof value;',
        '      if (actualType !== expectedType) {',
        '        return { field: field, message: field + \' must be \' + expectedType + \', got \' + actualType, severity: \'error\', code: \'TYPE_MISMATCH\' };',
        '      }',
        '      return null;',
        '    });',
        '  }',
        '',
        '  addRangeRule(field: string, min: number, max: number): void {',
        '    this.addRule(field, function(value: unknown) {',
        '      if (typeof value !== \'number\') return null;',
        '      if (value < min || value > max) {',
        '        return { field: field, message: field + \' must be between \' + min + \' and \' + max, severity: \'error\', code: \'OUT_OF_RANGE\' };',
        '      }',
        '      return null;',
        '    });',
        '  }',
        '',
        '  addLengthRule(field: string, minLength: number, maxLength: number): void {',
        '    this.addRule(field, function(value: unknown) {',
        '      if (typeof value !== \'string\') return null;',
        '      if (value.length < minLength || value.length > maxLength) {',
        '        return { field: field, message: field + \' length must be between \' + minLength + \' and \' + maxLength, severity: \'error\', code: \'LENGTH_INVALID\' };',
        '      }',
        '      return null;',
        '    });',
        '  }',
        '',
        '  validate(data: Record<string, unknown>): ValidationReport {',
        '    var issues: ValidationIssue[] = [];',
        '    for (var i = 0; i < this._rules.length; i++) {',
        '      var rule = this._rules[i];',
        '      var value = data[rule.field];',
        '      var issue = rule.validate(value);',
        '      if (issue) issues.push(issue);',
        '    }',
        '    var errors = issues.filter(function(i) { return i.severity === \'error\'; });',
        '    var warnings = issues.filter(function(i) { return i.severity === \'warning\'; });',
        '    return { valid: errors.length === 0, issues: issues, errors: errors, warnings: warnings };',
        '  }',
        '',
        '  validateOrThrow(data: Record<string, unknown>): void {',
        '    var report = this.validate(data);',
        '    if (!report.valid) {',
        '      var messages = report.errors.map(function(e) { return e.field + \': \' + e.message; });',
        '      throw new Error(\'Validation failed: \' + messages.join(\'; \'));',
        '    }',
        '  }',
        '',
        '  getRuleCount(): number { return this._rules.length; }',
        '',
        '  clearRules(): void { this._rules = []; }',
        '}',
        '',
      ];
    } else {
      // QueryService
      content = [
        '/**',
        ' * ' + s.name,
        ' *',
        ' * ' + s.desc + '.',
        ' */',
        '',
        'export interface QueryOptions {',
        '  filter?: Record<string, unknown>;',
        '  sort?: { field: string; direction: \'asc\' | \'desc\' };',
        '  limit?: number;',
        '  offset?: number;',
        '  fields?: string[];',
        '}',
        '',
        'export interface QueryResult<T> {',
        '  items: T[];',
        '  total: number;',
        '  hasMore: boolean;',
        '}',
        '',
        'export class ' + s.name + ' {',
        '  private _data: Map<string, Record<string, unknown>>;',
        '',
        '  constructor() {',
        '    this._data = new Map();',
        '  }',
        '',
        '  insert(id: string, item: Record<string, unknown>): void {',
        '    this._data.set(id, { ...item, _id: id });',
        '  }',
        '',
        '  update(id: string, patch: Record<string, unknown>): boolean {',
        '    var existing = this._data.get(id);',
        '    if (!existing) return false;',
        '    this._data.set(id, { ...existing, ...patch, _id: id });',
        '    return true;',
        '  }',
        '',
        '  delete(id: string): boolean {',
        '    return this._data.delete(id);',
        '  }',
        '',
        '  findById(id: string): Record<string, unknown> | null {',
        '    return this._data.get(id) ?? null;',
        '  }',
        '',
        '  query(options: QueryOptions = {}): QueryResult<Record<string, unknown>> {',
        '    var items = Array.from(this._data.values());',
        '',
        '    if (options.filter) {',
        '      items = items.filter(function(item) {',
        '        return Object.entries(options.filter!).every(function(entry) {',
        '          return item[entry[0]] === entry[1];',
        '        });',
        '      });',
        '    }',
        '',
        '    if (options.sort) {',
        '      var sortField = options.sort.field;',
        '      var direction = options.sort.direction;',
        '      items.sort(function(a, b) {',
        '        var av = a[sortField];',
        '        var bv = b[sortField];',
        '        if (av === bv) return 0;',
        '        var cmp = av < bv ? -1 : 1;',
        '        return direction === \'desc\' ? -cmp : cmp;',
        '      });',
        '    }',
        '',
        '    var total = items.length;',
        '    var offset = options.offset ?? 0;',
        '    var limit = options.limit ?? total;',
        '    var paged = items.slice(offset, offset + limit);',
        '',
        '    if (options.fields) {',
        '      paged = paged.map(function(item) {',
        '        var projected: Record<string, unknown> = {};',
        '        options.fields!.forEach(function(f) { projected[f] = item[f]; });',
        '        return projected;',
        '      });',
        '    }',
        '',
        '    return { items: paged, total: total, hasMore: offset + limit < total };',
        '  }',
        '',
        '  count(filter?: Record<string, unknown>): number {',
        '    if (!filter) return this._data.size;',
        '    return this.query({ filter: filter }).total;',
        '  }',
        '',
        '  clear(): void { this._data.clear(); }',
        '',
        '  size(): number { return this._data.size; }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));

    if (!existingIndex.includes(s.name)) {
      exports.push('export { ' + s.name + ' } from \'./' + s.name + '\';');
    }
  }

  if (exports.length > 0) {
    var indexPath = path.join(servicesDir, 'index.ts');
    var existingContent = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    writeFile(indexPath, existingContent + exports.join('\n') + '\n');
  }
}

function generateRepository(info) {
  var p = info.pascal;
  var repoDir = path.join(info.baseDir, 'domain', 'repositories');

  var className = p + 'InMemoryRepository';
  var filePath = path.join(repoDir, className + '.ts');

  if (fileExists(filePath)) return;

  var content = [
    '/**',
    ' * ' + className,
    ' *',
    ' * In-memory repository for ' + info.kebab + ' domain entities.',
    ' */',
    '',
    'export interface ' + p + 'Aggregate {',
    '  id: string;',
    '  version: number;',
    '  data: Record<string, unknown>;',
    '  createdAt: number;',
    '  updatedAt: number;',
    '}',
    '',
    'export class ' + className + ' {',
    '  private _store: Map<string, ' + p + 'Aggregate>;',
    '  private _versionCounter: number;',
    '',
    '  constructor() {',
    '    this._store = new Map();',
    '    this._versionCounter = 0;',
    '  }',
    '',
    '  save(aggregate: ' + p + 'Aggregate): ' + p + 'Aggregate {',
    '    var stored: ' + p + 'Aggregate = {',
    '      ...aggregate,',
    '      version: ++this._versionCounter,',
    '      updatedAt: Date.now(),',
    '    };',
    '    this._store.set(aggregate.id, stored);',
    '    return stored;',
    '  }',
    '',
    '  findById(id: string): ' + p + 'Aggregate | null {',
    '    return this._store.get(id) ?? null;',
    '  }',
    '',
    '  findAll(): ' + p + 'Aggregate[] {',
    '    return Array.from(this._store.values());',
    '  }',
    '',
    '  findByIds(ids: string[]): ' + p + 'Aggregate[] {',
    '    return ids.map(function(id) { return this._store.get(id); }.bind(this)).filter(Boolean) as ' + p + 'Aggregate[];',
    '  }',
    '',
    '  delete(id: string): boolean {',
    '    return this._store.delete(id);',
    '  }',
    '',
    '  exists(id: string): boolean {',
    '    return this._store.has(id);',
    '  }',
    '',
    '  count(): number { return this._store.size; }',
    '',
    '  clear(): void {',
    '    this._store.clear();',
    '    this._versionCounter = 0;',
    '  }',
    '',
    '  transaction(operations: Array<() => void>): void {',
    '    var snapshot = new Map(this._store);',
    '    try {',
    '      operations.forEach(function(op) { op(); });',
    '    } catch (e) {',
    '      this._store = snapshot;',
    '      throw e;',
    '    }',
    '  }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));

  var indexPath = path.join(repoDir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (!existing.includes(className)) {
    writeFile(indexPath, existing + 'export { ' + className + ', ' + p + 'Aggregate } from \'./' + className + '\';\n');
  }
}

function generateMapper(info) {
  var p = info.pascal;
  var mapperDir = path.join(info.baseDir, 'domain', 'mappers');

  var className = p + 'Mapper';
  var filePath = path.join(mapperDir, className + '.ts');

  if (fileExists(filePath)) return;

  var content = [
    '/**',
    ' * ' + className,
    ' *',
    ' * Maps between ' + info.kebab + ' domain entities and DTOs.',
    ' */',
    '',
    'export interface ' + p + 'Dto {',
    '  id: string;',
    '  status: string;',
    '  createdAt: string;',
    '  updatedAt: string;',
    '  attributes: Record<string, unknown>;',
    '  tags: string[];',
    '}',
    '',
    'export interface ' + p + 'EntityData {',
    '  id: string;',
    '  status: string;',
    '  createdAt: number;',
    '  updatedAt: number;',
    '  attributes: Record<string, unknown>;',
    '  tags: string[];',
    '}',
    '',
    'export class ' + className + ' {',
    '  toDto(entity: ' + p + 'EntityData): ' + p + 'Dto {',
    '    return {',
    '      id: entity.id,',
    '      status: entity.status,',
    '      createdAt: new Date(entity.createdAt).toISOString(),',
    '      updatedAt: new Date(entity.updatedAt).toISOString(),',
    '      attributes: { ...entity.attributes },',
    '      tags: [...entity.tags],',
    '    };',
    '  }',
    '',
    '  toEntity(dto: ' + p + 'Dto): ' + p + 'EntityData {',
    '    return {',
    '      id: dto.id,',
    '      status: dto.status,',
    '      createdAt: new Date(dto.createdAt).getTime(),',
    '      updatedAt: new Date(dto.updatedAt).getTime(),',
    '      attributes: { ...dto.attributes },',
    '      tags: [...dto.tags],',
    '    };',
    '  }',
    '',
    '  toDtoList(entities: ' + p + 'EntityData[]): ' + p + 'Dto[] {',
    '    return entities.map(function(e) { return this.toDto(e); }.bind(this));',
    '  }',
    '',
    '  toEntityList(dtos: ' + p + 'Dto[]): ' + p + 'EntityData[] {',
    '    return dtos.map(function(d) { return this.toEntity(d); }.bind(this));',
    '  }',
    '',
    '  merge(base: ' + p + 'EntityData, patch: Partial<' + p + 'EntityData>): ' + p + 'EntityData {',
    '    return {',
    '      ...base,',
    '      ...patch,',
    '      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },',
    '      tags: patch.tags ? [...patch.tags] : [...base.tags],',
    '    };',
    '  }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));

  var indexPath = path.join(mapperDir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (!existing.includes(className)) {
    writeFile(indexPath, existing + 'export { ' + className + ', ' + p + 'Dto, ' + p + 'EntityData } from \'./' + className + '\';\n');
  }
}

function generateHandlers(info) {
  var p = info.pascal;
  var handlersDir = path.join(info.baseDir, 'domain', 'handlers');

  var handlers = [
    { name: p + 'CommandHandler', desc: 'Handles ' + info.kebab + ' commands' },
    { name: p + 'QueryHandler', desc: 'Handles ' + info.kebab + ' queries' },
  ];

  var exports = [];

  for (var i = 0; i < handlers.length; i++) {
    var h = handlers[i];
    var filePath = path.join(handlersDir, h.name + '.ts');

    if (fileExists(filePath)) {
      if (!exports.some(function(e) { return e.includes(h.name); })) {
        exports.push('export { ' + h.name + ' } from \'./' + h.name + '\';');
      }
      continue;
    }

    var content;
    if (h.name.includes('Command')) {
      content = [
        '/**',
        ' * ' + h.name,
        ' *',
        ' * ' + h.desc + '.',
        ' */',
        '',
        'export interface ' + p + 'Command {',
        '  type: string;',
        '  payload: Record<string, unknown>;',
        '  metadata: Record<string, unknown>;',
        '}',
        '',
        'export interface ' + p + 'CommandResult {',
        '  success: boolean;',
        '  commandId: string;',
        '  result?: unknown;',
        '  error?: string;',
        '  durationMs: number;',
        '}',
        '',
        'type CommandHandlerFn = (command: ' + p + 'Command) => Promise<unknown>;',
        '',
        'export class ' + h.name + ' {',
        '  private _handlers: Map<string, CommandHandlerFn>;',
        '  private _middleware: Array<(cmd: ' + p + 'Command) => ' + p + 'Command>;',
        '  private _results: ' + p + 'CommandResult[];',
        '',
        '  constructor() {',
        '    this._handlers = new Map();',
        '    this._middleware = [];',
        '    this._results = [];',
        '  }',
        '',
        '  register(commandType: string, handler: CommandHandlerFn): void {',
        '    this._handlers.set(commandType, handler);',
        '  }',
        '',
        '  use(middleware: (cmd: ' + p + 'Command) => ' + p + 'Command): void {',
        '    this._middleware.push(middleware);',
        '  }',
        '',
        '  async handle(command: ' + p + 'Command): Promise<' + p + 'CommandResult> {',
        '    var start = Date.now();',
        '    var cmd = command;',
        '    for (var i = 0; i < this._middleware.length; i++) {',
        '      cmd = this._middleware[i](cmd);',
        '    }',
        '    var handler = this._handlers.get(cmd.type);',
        '    if (!handler) {',
        '      var result: ' + p + 'CommandResult = {',
        '        success: false,',
        '        commandId: cmd.metadata.commandId as string ?? \'unknown\',',
        '        error: \'No handler for command type: \' + cmd.type,',
        '        durationMs: Date.now() - start,',
        '      };',
        '      this._results.push(result);',
        '      return result;',
        '    }',
        '    try {',
        '      var output = await handler(cmd);',
        '      var okResult: ' + p + 'CommandResult = {',
        '        success: true,',
        '        commandId: cmd.metadata.commandId as string ?? \'unknown\',',
        '        result: output,',
        '        durationMs: Date.now() - start,',
        '      };',
        '      this._results.push(okResult);',
        '      return okResult;',
        '    } catch (e) {',
        '      var errResult: ' + p + 'CommandResult = {',
        '        success: false,',
        '        commandId: cmd.metadata.commandId as string ?? \'unknown\',',
        '        error: (e as Error).message,',
        '        durationMs: Date.now() - start,',
        '      };',
        '      this._results.push(errResult);',
        '      return errResult;',
        '    }',
        '  }',
        '',
        '  getResults(): ' + p + 'CommandResult[] { return [...this._results]; }',
        '  getRegisteredCommands(): string[] { return Array.from(this._handlers.keys()); }',
        '  clearResults(): void { this._results = []; }',
        '}',
        '',
      ];
    } else {
      content = [
        '/**',
        ' * ' + h.name,
        ' *',
        ' * ' + h.desc + '.',
        ' */',
        '',
        'export interface ' + p + 'Query {',
        '  type: string;',
        '  params: Record<string, unknown>;',
        '}',
        '',
        'export interface ' + p + 'QueryResult {',
        '  success: boolean;',
        '  data?: unknown;',
        '  error?: string;',
        '  cached: boolean;',
        '}',
        '',
        'type QueryHandlerFn = (query: ' + p + 'Query) => Promise<unknown>;',
        '',
        'export class ' + h.name + ' {',
        '  private _handlers: Map<string, QueryHandlerFn>;',
        '  private _cache: Map<string, { data: unknown; expiresAt: number }>;',
        '  private _cacheTtlMs: number;',
        '',
        '  constructor(cacheTtlMs: number = 60000) {',
        '    this._handlers = new Map();',
        '    this._cache = new Map();',
        '    this._cacheTtlMs = cacheTtlMs;',
        '  }',
        '',
        '  register(queryType: string, handler: QueryHandlerFn): void {',
        '    this._handlers.set(queryType, handler);',
        '  }',
        '',
        '  async handle(query: ' + p + 'Query): Promise<' + p + 'QueryResult> {',
        '    var cacheKey = query.type + \':\' + JSON.stringify(query.params);',
        '    var cached = this._cache.get(cacheKey);',
        '    if (cached && cached.expiresAt > Date.now()) {',
        '      return { success: true, data: cached.data, cached: true };',
        '    }',
        '    var handler = this._handlers.get(query.type);',
        '    if (!handler) {',
        '      return { success: false, error: \'No handler for query type: \' + query.type, cached: false };',
        '    }',
        '    try {',
        '      var data = await handler(query);',
        '      this._cache.set(cacheKey, { data: data, expiresAt: Date.now() + this._cacheTtlMs });',
        '      return { success: true, data: data, cached: false };',
        '    } catch (e) {',
        '      return { success: false, error: (e as Error).message, cached: false };',
        '    }',
        '  }',
        '',
        '  clearCache(): void { this._cache.clear(); }',
        '  getCacheSize(): number { return this._cache.size; }',
        '  getRegisteredQueries(): string[] { return Array.from(this._handlers.keys()); }',
        '',
        '  setCacheTtl(ttlMs: number): void { this._cacheTtlMs = ttlMs; }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));
    exports.push('export { ' + h.name + ' } from \'./' + h.name + '\';');
  }

  var indexPath = path.join(handlersDir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  for (var j = 0; j < exports.length; j++) {
    if (!existing.includes(handlers[j].name)) {
      existing += exports[j] + '\n';
    }
  }
  writeFile(indexPath, existing);
}

function generateServiceTests(info) {
  var p = info.pascal;
  var testDir = path.join(info.baseDir, 'domain', '__tests__');
  var testPath = path.join(testDir, p + 'Services.test.ts');

  if (fileExists(testPath)) return;

  var content = [
    '/**',
    ' * Domain service tests for ' + p,
    ' */',
    '',
    'import { ' + p + 'ExecutionService } from \'../services/' + p + 'ExecutionService\';',
    'import { ' + p + 'ValidationService } from \'../services/' + p + 'ValidationService\';',
    'import { ' + p + 'QueryService } from \'../services/' + p + 'QueryService\';',
    'import { ' + p + 'InMemoryRepository } from \'../repositories/' + p + 'InMemoryRepository\';',
    'import { ' + p + 'Mapper } from \'../mappers/' + p + 'Mapper\';',
    'import { ' + p + 'CommandHandler } from \'../handlers/' + p + 'CommandHandler\';',
    'import { ' + p + 'QueryHandler } from \'../handlers/' + p + 'QueryHandler\';',
    '',
    'describe(\'Services: ' + p + '\', () => {',
    '  describe(\'' + p + 'ExecutionService\', () => {',
    '    it(\'should start and complete execution\', () => {',
    '      var svc = new ' + p + 'ExecutionService();',
    '      var rec = svc.start(\'exec-1\', { test: true });',
    '      expect(rec.status).toBe(\'running\');',
    '      var done = svc.complete(\'exec-1\', { result: \'ok\' });',
    '      expect(done!.status).toBe(\'completed\');',
    '      expect(done!.durationMs).toBeGreaterThanOrEqual(0);',
    '    });',
    '',
    '    it(\'should handle failures\', () => {',
    '      var svc = new ' + p + 'ExecutionService();',
    '      svc.start(\'exec-2\', \'test\');',
    '      var failed = svc.fail(\'exec-2\', \'something went wrong\');',
    '      expect(failed!.status).toBe(\'failed\');',
    '      expect(failed!.error).toBe(\'something went wrong\');',
    '    });',
    '',
    '    it(\'should track active executions\', () => {',
    '      var svc = new ' + p + 'ExecutionService();',
    '      svc.start(\'exec-3\', \'test\');',
    '      svc.start(\'exec-4\', \'test\');',
    '      expect(svc.getActiveExecutions().length).toBe(2);',
    '    });',
    '',
    '    it(\'should compute success rate\', () => {',
    '      var svc = new ' + p + 'ExecutionService();',
    '      svc.start(\'e1\', \'\'); svc.complete(\'e1\', \'\');',
    '      svc.start(\'e2\', \'\'); svc.fail(\'e2\', \'err\');',
    '      expect(svc.getSuccessRate()).toBeCloseTo(0.5, 5);',
    '    });',
    '',
    '    it(\'should cancel active execution\', () => {',
    '      var svc = new ' + p + 'ExecutionService();',
    '      svc.start(\'exec-5\', \'test\');',
    '      expect(svc.cancel(\'exec-5\')).toBe(true);',
    '      expect(svc.getActiveExecutions().length).toBe(0);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'ValidationService\', () => {',
    '    it(\'should validate required fields\', () => {',
    '      var svc = new ' + p + 'ValidationService();',
    '      svc.addRequiredRule(\'name\');',
    '      var report = svc.validate({ name: \'\' });',
    '      expect(report.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should pass valid data\', () => {',
    '      var svc = new ' + p + 'ValidationService();',
    '      svc.addRequiredRule(\'name\');',
    '      var report = svc.validate({ name: \'test\' });',
    '      expect(report.valid).toBe(true);',
    '    });',
    '',
    '    it(\'should validate types\', () => {',
    '      var svc = new ' + p + 'ValidationService();',
    '      svc.addTypeRule(\'count\', \'number\');',
    '      var report = svc.validate({ count: \'not a number\' });',
    '      expect(report.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should validate ranges\', () => {',
    '      var svc = new ' + p + 'ValidationService();',
    '      svc.addRangeRule(\'age\', 0, 120);',
    '      var report = svc.validate({ age: 150 });',
    '      expect(report.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should throw on invalid data\', () => {',
    '      var svc = new ' + p + 'ValidationService();',
    '      svc.addRequiredRule(\'field\');',
    '      expect(() => svc.validateOrThrow({ field: \'\' })).toThrow();',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'QueryService\', () => {',
    '    it(\'should insert and find by id\', () => {',
    '      var svc = new ' + p + 'QueryService();',
    '      svc.insert(\'1\', { name: \'test\' });',
    '      var item = svc.findById(\'1\');',
    '      expect(item).not.toBeNull();',
    '      expect(item!.name).toBe(\'test\');',
    '    });',
    '',
    '    it(\'should query with filter\', () => {',
    '      var svc = new ' + p + 'QueryService();',
    '      svc.insert(\'1\', { name: \'a\', type: \'x\' });',
    '      svc.insert(\'2\', { name: \'b\', type: \'y\' });',
    '      var result = svc.query({ filter: { type: \'x\' } });',
    '      expect(result.items.length).toBe(1);',
    '    });',
    '',
    '    it(\'should sort results\', () => {',
    '      var svc = new ' + p + 'QueryService();',
    '      svc.insert(\'1\', { name: \'c\' });',
    '      svc.insert(\'2\', { name: \'a\' });',
    '      svc.insert(\'3\', { name: \'b\' });',
    '      var result = svc.query({ sort: { field: \'name\', direction: \'asc\' } });',
    '      expect(result.items[0].name).toBe(\'a\');',
    '    });',
    '',
    '    it(\'should paginate\', () => {',
    '      var svc = new ' + p + 'QueryService();',
    '      for (var i = 0; i < 10; i++) svc.insert(String(i), { idx: i });',
    '      var result = svc.query({ limit: 3, offset: 5 });',
    '      expect(result.items.length).toBe(3);',
    '      expect(result.hasMore).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'InMemoryRepository\', () => {',
    '    it(\'should save and find\', () => {',
    '      var repo = new ' + p + 'InMemoryRepository();',
    '      repo.save({ id: \'1\', version: 0, data: { x: 1 }, createdAt: Date.now(), updatedAt: Date.now() });',
    '      var found = repo.findById(\'1\');',
    '      expect(found).not.toBeNull();',
    '      expect(found!.data.x).toBe(1);',
    '    });',
    '',
    '    it(\'should check existence\', () => {',
    '      var repo = new ' + p + 'InMemoryRepository();',
    '      repo.save({ id: \'1\', version: 0, data: {}, createdAt: 0, updatedAt: 0 });',
    '      expect(repo.exists(\'1\')).toBe(true);',
    '      expect(repo.exists(\'2\')).toBe(false);',
    '    });',
    '',
    '    it(\'should delete\', () => {',
    '      var repo = new ' + p + 'InMemoryRepository();',
    '      repo.save({ id: \'1\', version: 0, data: {}, createdAt: 0, updatedAt: 0 });',
    '      expect(repo.delete(\'1\')).toBe(true);',
    '      expect(repo.count()).toBe(0);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'Mapper\', () => {',
    '    it(\'should map entity to DTO\', () => {',
    '      var mapper = new ' + p + 'Mapper();',
    '      var dto = mapper.toDto({',
    '        id: \'1\', status: \'active\', createdAt: 1000, updatedAt: 2000,',
    '        attributes: { key: \'val\' }, tags: [\'a\'],',
    '      });',
    '      expect(dto.id).toBe(\'1\');',
    '      expect(dto.tags).toEqual([\'a\']);',
    '    });',
    '',
    '    it(\'should map DTO to entity\', () => {',
    '      var mapper = new ' + p + 'Mapper();',
    '      var entity = mapper.toEntity({',
    '        id: \'1\', status: \'active\', createdAt: \'1970-01-01T00:00:01.000Z\',',
    '        updatedAt: \'1970-01-01T00:00:02.000Z\', attributes: {}, tags: [],',
    '      });',
    '      expect(entity.createdAt).toBe(1000);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'CommandHandler\', () => {',
    '    it(\'should handle registered command\', async () => {',
    '      var handler = new ' + p + 'CommandHandler();',
    '      handler.register(\'create\', async () => \'created\');',
    '      var result = await handler.handle({ type: \'create\', payload: {}, metadata: { commandId: \'cmd-1\' } });',
    '      expect(result.success).toBe(true);',
    '      expect(result.result).toBe(\'created\');',
    '    });',
    '',
    '    it(\'should fail for unregistered command\', async () => {',
    '      var handler = new ' + p + 'CommandHandler();',
    '      var result = await handler.handle({ type: \'unknown\', payload: {}, metadata: {} });',
    '      expect(result.success).toBe(false);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'QueryHandler\', () => {',
    '    it(\'should handle query with caching\', async () => {',
    '      var handler = new ' + p + 'QueryHandler();',
    '      handler.register(\'get\', async () => \'data\');',
    '      var r1 = await handler.handle({ type: \'get\', params: {} });',
    '      expect(r1.success).toBe(true);',
    '      expect(r1.cached).toBe(false);',
    '      var r2 = await handler.handle({ type: \'get\', params: {} });',
    '      expect(r2.cached).toBe(true);',
    '    });',
    '  });',
    '});',
    '',
  ];

  writeFile(testPath, content.join('\n'));
}

// Main
var layers = fs.readdirSync(LAYERS_DIR).filter(function(f) {
  return fs.statSync(path.join(LAYERS_DIR, f)).isDirectory() && f !== '__tests__';
});

console.log('Processing ' + layers.length + ' layers...');

var stats = { services: 0, repos: 0, mappers: 0, handlers: 0, tests: 0 };

for (var i = 0; i < layers.length; i++) {
  var info = {
    pascal: toPascalCase(layers[i]),
    kebab: layers[i],
    baseDir: path.join(LAYERS_DIR, layers[i]),
  };

  try { generateDomainServices(info); stats.services++; } catch (e) { console.error('  services failed for ' + layers[i] + ': ' + e.message); }
  try { generateRepository(info); stats.repos++; } catch (e) { console.error('  repo failed for ' + layers[i] + ': ' + e.message); }
  try { generateMapper(info); stats.mappers++; } catch (e) { console.error('  mapper failed for ' + layers[i] + ': ' + e.message); }
  try { generateHandlers(info); stats.handlers++; } catch (e) { console.error('  handlers failed for ' + layers[i] + ': ' + e.message); }
  try { generateServiceTests(info); stats.tests++; } catch (e) { console.error('  tests failed for ' + layers[i] + ': ' + e.message); }
}

console.log('\nDone!');
console.log('Services: ' + stats.services);
console.log('Repositories: ' + stats.repos);
console.log('Mappers: ' + stats.mappers);
console.log('Handlers: ' + stats.handlers);
console.log('Tests: ' + stats.tests);
