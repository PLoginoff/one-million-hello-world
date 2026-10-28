#!/usr/bin/env node

/**
 * Generate policies, specifications, observers, pipelines, decorators,
 * and event handlers for all layers.
 *
 * Per layer adds:
 * - 2 policies (AccessPolicy, RatePolicy)
 * - 3 specifications (And, Or, Not)
 * - 1 observer (EventObserver with subscription)
 * - 1 pipeline (processing pipeline with stages)
 * - 2 decorators (Logging, Caching)
 * - 1 event handler (dispatches domain events)
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

function generatePolicies(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'policies');

  var policies = ['AccessPolicy', 'RatePolicy'];
  var exports = [];
  var existingIndex = fileExists(path.join(dir, 'index.ts'))
    ? fs.readFileSync(path.join(dir, 'index.ts'), 'utf8')
    : '';

  for (var i = 0; i < policies.length; i++) {
    var policyName = policies[i];
    var className = p + policyName;
    var fileName = className + '.ts';
    var filePath = path.join(dir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(className)) exports.push('export { ' + className + ' } from \'./' + className + '\';');
      continue;
    }

    var content;
    if (policyName === 'AccessPolicy') {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'export type AccessDecision = \'allow\' | \'deny\' | \'challenge\';',
        '',
        'export interface AccessContext {',
        '  userId: string;',
        '  resource: string;',
        '  action: string;',
        '  roles: string[];',
        '  attributes: Record<string, unknown>;',
        '}',
        '',
        'export interface AccessRule {',
        '  name: string;',
        '  evaluate: (ctx: AccessContext) => AccessDecision;',
        '  priority: number;',
        '}',
        '',
        'export class ' + className + ' {',
        '  private _rules: AccessRule[];',
        '  private _defaultDecision: AccessDecision;',
        '',
        '  constructor(defaultDecision: AccessDecision = \'deny\') {',
        '    this._rules = [];',
        '    this._defaultDecision = defaultDecision;',
        '  }',
        '',
        '  addRule(name: string, evaluate: (ctx: AccessContext) => AccessDecision, priority: number = 0): this {',
        '    this._rules.push({ name, evaluate, priority });',
        '    this._rules.sort((a, b) => b.priority - a.priority);',
        '    return this;',
        '  }',
        '',
        '  allowIfRole(role: string, priority: number = 10): this {',
        '    return this.addRule(\'role-\' + role, (ctx) => ctx.roles.includes(role) ? \'allow\' : \'deny\', priority);',
        '  }',
        '',
        '  denyIfRole(role: string, priority: number = 20): this {',
        '    return this.addRule(\'deny-\' + role, (ctx) => ctx.roles.includes(role) ? \'deny\' : \'allow\', priority);',
        '  }',
        '',
        '  evaluate(ctx: AccessContext): AccessDecision {',
        '    for (const rule of this._rules) {',
        '      var decision = rule.evaluate(ctx);',
        '      if (decision !== \'deny\' || rule.priority >= 100) {',
        '        return decision;',
        '      }',
        '    }',
        '    return this._defaultDecision;',
        '  }',
        '',
        '  isAllowed(ctx: AccessContext): boolean { return this.evaluate(ctx) === \'allow\'; }',
        '  isDenied(ctx: AccessContext): boolean { return this.evaluate(ctx) === \'deny\'; }',
        '',
        '  getRules(): string[] { return this._rules.map(r => r.name); }',
        '  clearRules(): void { this._rules = []; }',
        '}',
        '',
      ];
    } else {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'export interface RateLimitConfig {',
        '  maxRequests: number;',
        '  windowMs: number;',
        '  key: string;',
        '}',
        '',
        'export interface RateLimitEntry {',
        '  count: number;',
        '  windowStart: number;',
        '  blocked: boolean;',
        '  blockedUntil?: number;',
        '}',
        '',
        'export class ' + className + ' {',
        '  private _entries: Map<string, RateLimitEntry>;',
        '  private _configs: Map<string, RateLimitConfig>;',
        '  private _blockDurationMs: number;',
        '',
        '  constructor(blockDurationMs: number = 60000) {',
        '    this._entries = new Map();',
        '    this._configs = new Map();',
        '    this._blockDurationMs = blockDurationMs;',
        '  }',
        '',
        '  configure(key: string, config: RateLimitConfig): void {',
        '    this._configs.set(key, config);',
        '  }',
        '',
        '  check(key: string, identifier: string): { allowed: boolean; remaining: number; retryAfter?: number } {',
        '    var config = this._configs.get(key);',
        '    if (!config) return { allowed: true, remaining: Infinity };',
        '',
        '    var entryKey = key + \':\' + identifier;',
        '    var entry = this._entries.get(entryKey);',
        '    var now = Date.now();',
        '',
        '    if (entry && entry.blocked && entry.blockedUntil && now < entry.blockedUntil) {',
        '      return { allowed: false, remaining: 0, retryAfter: entry.blockedUntil - now };',
        '    }',
        '',
        '    if (!entry || now - entry.windowStart > config.windowMs) {',
        '      entry = { count: 0, windowStart: now, blocked: false };',
        '      this._entries.set(entryKey, entry);',
        '    }',
        '',
        '    entry.count++;',
        '    var remaining = Math.max(0, config.maxRequests - entry.count);',
        '',
        '    if (entry.count > config.maxRequests) {',
        '      entry.blocked = true;',
        '      entry.blockedUntil = now + this._blockDurationMs;',
        '      return { allowed: false, remaining: 0, retryAfter: this._blockDurationMs };',
        '    }',
        '',
        '    return { allowed: true, remaining: remaining };',
        '  }',
        '',
        '  reset(key: string, identifier: string): void {',
        '    this._entries.delete(key + \':\' + identifier);',
        '  }',
        '',
        '  resetAll(): void { this._entries.clear(); }',
        '',
        '  getEntry(key: string, identifier: string): RateLimitEntry | null {',
        '    return this._entries.get(key + \':\' + identifier) ?? null;',
        '  }',
        '',
        '  getBlockDuration(): number { return this._blockDurationMs; }',
        '  setBlockDuration(ms: number): void { this._blockDurationMs = ms; }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));
    if (!existingIndex.includes(className)) {
      exports.push('export { ' + className + ' } from \'./' + className + '\';');
    }
  }

  if (exports.length > 0) {
    var indexPath = path.join(dir, 'index.ts');
    var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    writeFile(indexPath, existing + exports.join('\n') + '\n');
  }
}

function generateSpecifications(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'specifications');

  var specs = ['AndSpecification', 'OrSpecification', 'NotSpecification'];
  var exports = [];

  for (var i = 0; i < specs.length; i++) {
    var specName = specs[i];
    var className = p + specName;
    var filePath = path.join(dir, className + '.ts');

    if (fileExists(filePath)) {
      if (!exports.some(e => e.includes(className))) exports.push('export { ' + className + ' } from \'./' + className + '\';');
      continue;
    }

    var content;
    if (specName === 'AndSpecification') {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'export interface I' + p + 'Specification {',
        '  isSatisfiedBy(candidate: unknown): boolean;',
        '  and(other: I' + p + 'Specification): I' + p + 'Specification;',
        '  or(other: I' + p + 'Specification): I' + p + 'Specification;',
        '  not(): I' + p + 'Specification;',
        '}',
        '',
        'export class ' + className + ' implements I' + p + 'Specification {',
        '  private _specs: I' + p + 'Specification[];',
        '',
        '  constructor(specs: I' + p + 'Specification[] = []) {',
        '    this._specs = specs;',
        '  }',
        '',
        '  isSatisfiedBy(candidate: unknown): boolean {',
        '    return this._specs.every(s => s.isSatisfiedBy(candidate));',
        '  }',
        '',
        '  and(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + className + '([...this._specs, other]);',
        '  }',
        '',
        '  or(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + p + 'OrSpecification([this, other]);',
        '  }',
        '',
        '  not(): I' + p + 'Specification {',
        '    return new ' + p + 'NotSpecification(this);',
        '  }',
        '',
        '  getSpecifications(): I' + p + 'Specification[] { return [...this._specs]; }',
        '}',
        '',
      ];
    } else if (specName === 'OrSpecification') {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'import { I' + p + 'Specification, ' + p + 'AndSpecification, ' + p + 'NotSpecification } from \'./' + p + 'AndSpecification\';',
        '',
        'export class ' + className + ' implements I' + p + 'Specification {',
        '  private _specs: I' + p + 'Specification[];',
        '',
        '  constructor(specs: I' + p + 'Specification[] = []) {',
        '    this._specs = specs;',
        '  }',
        '',
        '  isSatisfiedBy(candidate: unknown): boolean {',
        '    return this._specs.some(s => s.isSatisfiedBy(candidate));',
        '  }',
        '',
        '  and(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + p + 'AndSpecification([this, other]);',
        '  }',
        '',
        '  or(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + className + '([...this._specs, other]);',
        '  }',
        '',
        '  not(): I' + p + 'Specification {',
        '    return new ' + p + 'NotSpecification(this);',
        '  }',
        '',
        '  getSpecifications(): I' + p + 'Specification[] { return [...this._specs]; }',
        '}',
        '',
      ];
    } else {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'import { I' + p + 'Specification, ' + p + 'AndSpecification, ' + p + 'OrSpecification } from \'./' + p + 'AndSpecification\';',
        '',
        'export class ' + className + ' implements I' + p + 'Specification {',
        '  private _spec: I' + p + 'Specification;',
        '',
        '  constructor(spec: I' + p + 'Specification) {',
        '    this._spec = spec;',
        '  }',
        '',
        '  isSatisfiedBy(candidate: unknown): boolean {',
        '    return !this._spec.isSatisfiedBy(candidate);',
        '  }',
        '',
        '  and(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + p + 'AndSpecification([this, other]);',
        '  }',
        '',
        '  or(other: I' + p + 'Specification): I' + p + 'Specification {',
        '    return new ' + p + 'OrSpecification([this, other]);',
        '  }',
        '',
        '  not(): I' + p + 'Specification {',
        '    return this._spec;',
        '  }',
        '',
        '  getInner(): I' + p + 'Specification { return this._spec; }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));
    exports.push('export { ' + className + ' } from \'./' + className + '\';');
  }

  // Also export the interface from AndSpecification
  exports.push('export { I' + p + 'Specification } from \'./' + p + 'AndSpecification\';');

  var indexPath = path.join(dir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  var newExports = exports.filter(e => !existing.includes(e.split(' from ')[0].replace('export { ', '').replace(' }', '')));
  if (newExports.length > 0) {
    writeFile(indexPath, existing + newExports.join('\n') + '\n');
  }
}

function generateObserver(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'observers');
  var className = p + 'EventObserver';
  var filePath = path.join(dir, className + '.ts');

  if (fileExists(filePath)) return;

  var content = [
    '/**',
    ' * ' + className,
    ' */',
    '',
    'export interface I' + p + 'EventListener {',
    '  onEvent(eventType: string, payload: unknown): void;',
    '}',
    '',
    'export interface ' + p + 'Subscription {',
    '  id: string;',
    '  eventType: string;',
    '  listener: I' + p + 'EventListener;',
    '  once: boolean;',
    '}',
    '',
    'export class ' + className + ' {',
    '  private _subscriptions: Map<string, ' + p + 'Subscription>;',
    '  private _eventLog: Array<{ type: string; payload: unknown; timestamp: number }>;',
    '  private _maxLogSize: number;',
    '',
    '  constructor(maxLogSize: number = 1000) {',
    '    this._subscriptions = new Map();',
    '    this._eventLog = [];',
    '    this._maxLogSize = maxLogSize;',
    '  }',
    '',
    '  subscribe(eventType: string, listener: I' + p + 'EventListener): string {',
    '    var id = \'sub-\' + Date.now() + \'-\' + Math.random().toString(36).slice(2, 8);',
    '    this._subscriptions.set(id, { id, eventType, listener, once: false });',
    '    return id;',
    '  }',
    '',
    '  subscribeOnce(eventType: string, listener: I' + p + 'EventListener): string {',
    '    var id = \'sub-once-\' + Date.now() + \'-\' + Math.random().toString(36).slice(2, 8);',
    '    this._subscriptions.set(id, { id, eventType, listener, once: true });',
    '    return id;',
    '  }',
    '',
    '  unsubscribe(id: string): boolean {',
    '    return this._subscriptions.delete(id);',
    '  }',
    '',
    '  emit(eventType: string, payload: unknown): void {',
    '    this._eventLog.push({ type: eventType, payload, timestamp: Date.now() });',
    '    if (this._eventLog.length > this._maxLogSize) {',
    '      this._eventLog.shift();',
    '    }',
    '    for (const [id, sub] of this._subscriptions) {',
    '      if (sub.eventType === eventType || sub.eventType === \'*\') {',
    '        sub.listener.onEvent(eventType, payload);',
    '        if (sub.once) {',
    '          this._subscriptions.delete(id);',
    '        }',
    '      }',
    '    }',
    '  }',
    '',
    '  getSubscriptionCount(): number { return this._subscriptions.size; }',
    '  getEventLog(): Array<{ type: string; payload: unknown; timestamp: number }> { return [...this._eventLog]; }',
    '  getEventLogByType(type: string): Array<{ type: string; payload: unknown; timestamp: number }> {',
    '    return this._eventLog.filter(e => e.type === type);',
    '  }',
    '',
    '  clearSubscriptions(): void { this._subscriptions.clear(); }',
    '  clearLog(): void { this._eventLog = []; }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));

  var indexPath = path.join(dir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (!existing.includes(className)) {
    writeFile(indexPath, existing + 'export { ' + className + ', I' + p + 'EventListener, ' + p + 'Subscription } from \'./' + className + '\';\n');
  }
}

function generatePipeline(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'pipelines');
  var className = p + 'ProcessingPipeline';
  var filePath = path.join(dir, className + '.ts');

  if (fileExists(filePath)) return;

  var content = [
    '/**',
    ' * ' + className,
    ' */',
    '',
    'export interface ' + p + 'PipelineContext {',
    '  id: string;',
    '  input: unknown;',
    '  metadata: Record<string, unknown>;',
    '  stages: string[];',
    '  currentStage: number;',
    '  output?: unknown;',
    '  error?: string;',
    '  startTime: number;',
    '  endTime?: number;',
    '}',
    '',
    'export interface ' + p + 'PipelineStage {',
    '  name: string;',
    '  process: (ctx: ' + p + 'PipelineContext) => Promise<void>;',
    '  handleError?: (ctx: ' + p + 'PipelineContext, error: Error) => Promise<boolean>;',
    '}',
    '',
    'export class ' + className + ' {',
    '  private _stages: ' + p + 'PipelineStage[];',
    '  private _beforeHooks: Array<(ctx: ' + p + 'PipelineContext) => void>;',
    '  private _afterHooks: Array<(ctx: ' + p + 'PipelineContext) => void>;',
    '  private _executions: ' + p + 'PipelineContext[];',
    '',
    '  constructor() {',
    '    this._stages = [];',
    '    this._beforeHooks = [];',
    '    this._afterHooks = [];',
    '    this._executions = [];',
    '  }',
    '',
    '  addStage(name: string, process: (ctx: ' + p + 'PipelineContext) => Promise<void>, handleError?: (ctx: ' + p + 'PipelineContext, error: Error) => Promise<boolean>): this {',
    '    this._stages.push({ name, process, handleError });',
    '    return this;',
    '  }',
    '',
    '  beforeExecute(hook: (ctx: ' + p + 'PipelineContext) => void): this {',
    '    this._beforeHooks.push(hook);',
    '    return this;',
    '  }',
    '',
    '  afterExecute(hook: (ctx: ' + p + 'PipelineContext) => void): this {',
    '    this._afterHooks.push(hook);',
    '    return this;',
    '  }',
    '',
    '  async execute(input: unknown, metadata: Record<string, unknown> = {}): Promise<' + p + 'PipelineContext> {',
    '    var ctx: ' + p + 'PipelineContext = {',
    '      id: \'pipeline-\' + Date.now() + \'-\' + Math.random().toString(36).slice(2, 8),',
    '      input: input,',
    '      metadata: metadata,',
    '      stages: this._stages.map(s => s.name),',
    '      currentStage: 0,',
    '      startTime: Date.now(),',
    '    };',
    '',
    '    this._beforeHooks.forEach(h => h(ctx));',
    '',
    '    for (var i = 0; i < this._stages.length; i++) {',
    '      ctx.currentStage = i;',
    '      var stage = this._stages[i];',
    '      try {',
    '        await stage.process(ctx);',
    '      } catch (e) {',
    '        ctx.error = (e as Error).message;',
    '        if (stage.handleError) {',
    '          var shouldContinue = await stage.handleError(ctx, e as Error);',
    '          if (!shouldContinue) {',
    '            ctx.endTime = Date.now();',
    '            this._afterHooks.forEach(h => h(ctx));',
    '            this._executions.push(ctx);',
    '            return ctx;',
    '          }',
    '          ctx.error = undefined;',
    '        } else {',
    '          ctx.endTime = Date.now();',
    '          this._afterHooks.forEach(h => h(ctx));',
    '          this._executions.push(ctx);',
    '          return ctx;',
    '        }',
    '      }',
    '    }',
    '',
    '    ctx.endTime = Date.now();',
    '    this._afterHooks.forEach(h => h(ctx));',
    '    this._executions.push(ctx);',
    '    return ctx;',
    '  }',
    '',
    '  getStages(): string[] { return this._stages.map(s => s.name); }',
    '  getExecutions(): ' + p + 'PipelineContext[] { return [...this._executions]; }',
    '  getExecutionCount(): number { return this._executions.length; }',
    '  clearExecutions(): void { this._executions = []; }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));

  var indexPath = path.join(dir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (!existing.includes(className)) {
    writeFile(indexPath, existing + 'export { ' + className + ', ' + p + 'PipelineContext, ' + p + 'PipelineStage } from \'./' + className + '\';\n');
  }
}

function generateDecorators(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'decorators');
  var decorators = ['LoggingDecorator', 'CachingDecorator'];
  var exports = [];

  for (var i = 0; i < decorators.length; i++) {
    var decName = decorators[i];
    var className = p + decName;
    var filePath = path.join(dir, className + '.ts');

    if (fileExists(filePath)) {
      if (!exports.some(e => e.includes(className))) exports.push('export { ' + className + ' } from \'./' + className + '\';');
      continue;
    }

    var content;
    if (decName === 'LoggingDecorator') {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'export interface I' + p + 'Component {',
        '  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>;',
        '  getName(): string;',
        '}',
        '',
        'export interface ' + p + 'LogEntry {',
        '  timestamp: number;',
        '  level: string;',
        '  component: string;',
        '  message: string;',
        '  metadata?: Record<string, unknown>;',
        '}',
        '',
        'export class ' + className + ' implements I' + p + 'Component {',
        '  private _wrapped: I' + p + 'Component;',
        '  private _logs: ' + p + 'LogEntry[];',
        '  private _logLevel: string;',
        '  private _maxLogs: number;',
        '',
        '  constructor(wrapped: I' + p + 'Component, logLevel: string = \'info\', maxLogs: number = 1000) {',
        '    this._wrapped = wrapped;',
        '    this._logs = [];',
        '    this._logLevel = logLevel;',
        '    this._maxLogs = maxLogs;',
        '  }',
        '',
        '  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {',
        '    this._log(\'info\', \'Executing \' + this._wrapped.getName(), { input });',
        '    var start = Date.now();',
        '    try {',
        '      var result = await this._wrapped.execute(input);',
        '      var duration = Date.now() - start;',
        '      if (result.success) {',
        '        this._log(\'info\', \'Execution succeeded\', { duration, hasData: result.data !== undefined });',
        '      } else {',
        '        this._log(\'warn\', \'Execution failed\', { duration, error: result.error });',
        '      }',
        '      return result;',
        '    } catch (e) {',
        '      var dur = Date.now() - start;',
        '      this._log(\'error\', \'Execution threw\', { duration: dur, error: (e as Error).message });',
        '      throw e;',
        '    }',
        '  }',
        '',
        '  getName(): string { return this._wrapped.getName() + \'+logging\'; }',
        '',
        '  getLogs(): ' + p + 'LogEntry[] { return [...this._logs]; }',
        '  getLogsByLevel(level: string): ' + p + 'LogEntry[] { return this._logs.filter(l => l.level === level); }',
        '  clearLogs(): void { this._logs = []; }',
        '  getLogLevel(): string { return this._logLevel; }',
        '',
        '  private _log(level: string, message: string, metadata?: Record<string, unknown>): void {',
        '    this._logs.push({ timestamp: Date.now(), level, component: this._wrapped.getName(), message, metadata });',
        '    if (this._logs.length > this._maxLogs) { this._logs.shift(); }',
        '  }',
        '}',
        '',
      ];
    } else {
      content = [
        '/**',
        ' * ' + className,
        ' */',
        '',
        'import { I' + p + 'Component } from \'./' + p + 'LoggingDecorator\';',
        '',
        'interface CacheEntry {',
        '  data: unknown;',
        '  expiresAt: number;',
        '  hitCount: number;',
        '}',
        '',
        'export class ' + className + ' implements I' + p + 'Component {',
        '  private _wrapped: I' + p + 'Component;',
        '  private _cache: Map<string, CacheEntry>;',
        '  private _ttlMs: number;',
        '  private _hits: number;',
        '  private _misses: number;',
        '',
        '  constructor(wrapped: I' + p + 'Component, ttlMs: number = 60000) {',
        '    this._wrapped = wrapped;',
        '    this._cache = new Map();',
        '    this._ttlMs = ttlMs;',
        '    this._hits = 0;',
        '    this._misses = 0;',
        '  }',
        '',
        '  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {',
        '    var key = this._cacheKey(input);',
        '    var entry = this._cache.get(key);',
        '    if (entry && entry.expiresAt > Date.now()) {',
        '      entry.hitCount++;',
        '      this._hits++;',
        '      return { success: true, data: entry.data };',
        '    }',
        '    this._misses++;',
        '    var result = await this._wrapped.execute(input);',
        '    if (result.success) {',
        '      this._cache.set(key, { data: result.data, expiresAt: Date.now() + this._ttlMs, hitCount: 0 });',
        '    }',
        '    return result;',
        '  }',
        '',
        '  getName(): string { return this._wrapped.getName() + \'+caching\'; }',
        '',
        '  getHitRate(): number {',
        '    var total = this._hits + this._misses;',
        '    return total > 0 ? this._hits / total : 0;',
        '  }',
        '',
        '  getCacheSize(): number { return this._cache.size; }',
        '  getHits(): number { return this._hits; }',
        '  getMisses(): number { return this._misses; }',
        '',
        '  clearCache(): void { this._cache.clear(); this._hits = 0; this._misses = 0; }',
        '  setTtl(ttlMs: number): void { this._ttlMs = ttlMs; }',
        '',
        '  private _cacheKey(input: unknown): string {',
        '    return typeof input === \'string\' ? input : JSON.stringify(input);',
        '  }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));
    exports.push('export { ' + className + ' } from \'./' + className + '\';');
  }

  // Export interface
  exports.push('export { I' + p + 'Component } from \'./' + p + 'LoggingDecorator\';');

  var indexPath = path.join(dir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  var newExports = exports.filter(e => !existing.includes(e.split('{ ')[1].split(' ')[0]));
  if (newExports.length > 0) {
    writeFile(indexPath, existing + newExports.join('\n') + '\n');
  }
}

function generateEventHandler(info) {
  var p = info.pascal;
  var dir = path.join(info.baseDir, 'domain', 'handlers');
  var className = p + 'EventHandler';
  var filePath = path.join(dir, className + '.ts');

  if (fileExists(filePath)) return;

  var content = [
    '/**',
    ' * ' + className,
    ' */',
    '',
    'export interface ' + p + 'DomainEvent {',
    '  type: string;',
    '  payload: Record<string, unknown>;',
    '  timestamp: number;',
    '  source: string;',
    '}',
    '',
    'type ' + p + 'EventHandlerFn = (event: ' + p + 'DomainEvent) => Promise<void>;',
    '',
    'export class ' + className + ' {',
    '  private _handlers: Map<string, ' + p + 'EventHandlerFn[]>;',
    '  private _globalHandlers: ' + p + 'EventHandlerFn[];',
    '  private _processed: ' + p + 'DomainEvent[];',
    '  private _failed: Array<{ event: ' + p + 'DomainEvent; error: string }>;',
    '  private _maxHistory: number;',
    '',
    '  constructor(maxHistory: number = 500) {',
    '    this._handlers = new Map();',
    '    this._globalHandlers = [];',
    '    this._processed = [];',
    '    this._failed = [];',
    '    this._maxHistory = maxHistory;',
    '  }',
    '',
    '  on(eventType: string, handler: ' + p + 'EventHandlerFn): void {',
    '    var handlers = this._handlers.get(eventType) ?? [];',
    '    handlers.push(handler);',
    '    this._handlers.set(eventType, handlers);',
    '  }',
    '',
    '  onAny(handler: ' + p + 'EventHandlerFn): void {',
    '    this._globalHandlers.push(handler);',
    '  }',
    '',
    '  off(eventType: string, handler: ' + p + 'EventHandlerFn): boolean {',
    '    var handlers = this._handlers.get(eventType);',
    '    if (!handlers) return false;',
    '    var idx = handlers.indexOf(handler);',
    '    if (idx === -1) return false;',
    '    handlers.splice(idx, 1);',
    '    return true;',
    '  }',
    '',
    '  async dispatch(event: ' + p + 'DomainEvent): Promise<void> {',
    '    for (const gh of this._globalHandlers) {',
    '      try { await gh(event); } catch (e) { this._failed.push({ event, error: (e as Error).message }); }',
    '    }',
    '    var handlers = this._handlers.get(event.type) ?? [];',
    '    for (const h of handlers) {',
    '      try {',
    '        await h(event);',
    '      } catch (e) {',
    '        this._failed.push({ event, error: (e as Error).message });',
    '      }',
    '    }',
    '    this._processed.push(event);',
    '    if (this._processed.length > this._maxHistory) this._processed.shift();',
    '  }',
    '',
    '  getProcessedEvents(): ' + p + 'DomainEvent[] { return [...this._processed]; }',
    '  getFailedEvents(): Array<{ event: ' + p + 'DomainEvent; error: string }> { return [...this._failed]; }',
    '  getHandlerCount(eventType?: string): number {',
    '    if (eventType) return this._handlers.get(eventType)?.length ?? 0;',
    '    var total = 0;',
    '    for (const handlers of this._handlers.values()) total += handlers.length;',
    '    return total + this._globalHandlers.length;',
    '  }',
    '',
    '  clearHistory(): void { this._processed = []; this._failed = []; }',
    '  clearHandlers(): void { this._handlers.clear(); this._globalHandlers = []; }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));

  var indexPath = path.join(dir, 'index.ts');
  var existing = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  if (!existing.includes(className)) {
    writeFile(indexPath, existing + 'export { ' + className + ', ' + p + 'DomainEvent } from \'./' + className + '\';\n');
  }
}

function generatePatternTests(info) {
  var p = info.pascal;
  var testDir = path.join(info.baseDir, 'domain', '__tests__');
  var testPath = path.join(testDir, p + 'Patterns.test.ts');

  if (fileExists(testPath)) return;

  var content = [
    '/**',
    ' * Pattern tests for ' + p,
    ' */',
    '',
    'import { ' + p + 'AccessPolicy } from \'../policies/' + p + 'AccessPolicy\';',
    'import { ' + p + 'RatePolicy } from \'../policies/' + p + 'RatePolicy\';',
    'import { ' + p + 'AndSpecification } from \'../specifications/' + p + 'AndSpecification\';',
    'import { ' + p + 'OrSpecification } from \'../specifications/' + p + 'OrSpecification\';',
    'import { ' + p + 'NotSpecification } from \'../specifications/' + p + 'NotSpecification\';',
    'import { ' + p + 'EventObserver } from \'../observers/' + p + 'EventObserver\';',
    'import { ' + p + 'ProcessingPipeline } from \'../pipelines/' + p + 'ProcessingPipeline\';',
    'import { ' + p + 'LoggingDecorator, I' + p + 'Component } from \'../decorators/' + p + 'LoggingDecorator\';',
    'import { ' + p + 'CachingDecorator } from \'../decorators/' + p + 'CachingDecorator\';',
    'import { ' + p + 'EventHandler } from \'../handlers/' + p + 'EventHandler\';',
    '',
    'describe(\'Patterns: ' + p + '\', () => {',
    '  describe(\'' + p + 'AccessPolicy\', () => {',
    '    it(\'should allow with correct role\', () => {',
    '      var policy = new ' + p + 'AccessPolicy().allowIfRole(\'admin\');',
    '      expect(policy.isAllowed({ userId: \'u1\', resource: \'r\', action: \'a\', roles: [\'admin\'], attributes: {} })).toBe(true);',
    '    });',
    '',
    '    it(\'should deny without role\', () => {',
    '      var policy = new ' + p + 'AccessPolicy().allowIfRole(\'admin\');',
    '      expect(policy.isDenied({ userId: \'u1\', resource: \'r\', action: \'a\', roles: [\'user\'], attributes: {} })).toBe(true);',
    '    });',
    '',
    '    it(\'should support deny rules with higher priority\', () => {',
    '      var policy = new ' + p + 'AccessPolicy().allowIfRole(\'admin\').denyIfRole(\'banned\', 200);',
    '      expect(policy.isDenied({ userId: \'u1\', resource: \'r\', action: \'a\', roles: [\'admin\', \'banned\'], attributes: {} })).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'RatePolicy\', () => {',
    '    it(\'should allow within limit\', () => {',
    '      var policy = new ' + p + 'RatePolicy();',
    '      policy.configure(\'api\', { maxRequests: 3, windowMs: 1000, key: \'api\' });',
    '      expect(policy.check(\'api\', \'user-1\').allowed).toBe(true);',
    '    });',
    '',
    '    it(\'should block over limit\', () => {',
    '      var policy = new ' + p + 'RatePolicy(100);',
    '      policy.configure(\'api\', { maxRequests: 2, windowMs: 1000, key: \'api\' });',
    '      policy.check(\'api\', \'u\'); policy.check(\'api\', \'u\');',
    '      var result = policy.check(\'api\', \'u\');',
    '      expect(result.allowed).toBe(false);',
    '    });',
    '  });',
    '',
    '  describe(\'Specifications\', () => {',
    '    var alwaysTrue: any = { isSatisfiedBy: () => true, and: function(o:any){return this;}, or: function(o:any){return this;}, not: function(){return this;} };',
    '    var alwaysFalse: any = { isSatisfiedBy: () => false, and: function(o:any){return this;}, or: function(o:any){return this;}, not: function(){return this;} };',
    '',
    '    it(\'And should require all true\', () => {',
    '      var spec = new ' + p + 'AndSpecification([alwaysTrue, alwaysTrue]);',
    '      expect(spec.isSatisfiedBy({})).toBe(true);',
    '    });',
    '',
    '    it(\'And should fail if any false\', () => {',
    '      var spec = new ' + p + 'AndSpecification([alwaysTrue, alwaysFalse]);',
    '      expect(spec.isSatisfiedBy({})).toBe(false);',
    '    });',
    '',
    '    it(\'Or should pass if any true\', () => {',
    '      var spec = new ' + p + 'OrSpecification([alwaysFalse, alwaysTrue]);',
    '      expect(spec.isSatisfiedBy({})).toBe(true);',
    '    });',
    '',
    '    it(\'Not should invert\', () => {',
    '      var spec = new ' + p + 'NotSpecification(alwaysFalse);',
    '      expect(spec.isSatisfiedBy({})).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'EventObserver\', () => {',
    '    it(\'should notify subscribers\', () => {',
    '      var obs = new ' + p + 'EventObserver();',
    '      var received: string[] = [];',
    '      obs.subscribe(\'test\', { onEvent: (type, payload) => received.push(type + \':\' + String(payload)) });',
    '      obs.emit(\'test\', \'hello\');',
    '      expect(received).toContain(\'test:hello\');',
    '    });',
    '',
    '    it(\'should handle once subscriptions\', () => {',
    '      var obs = new ' + p + 'EventObserver();',
    '      var count = 0;',
    '      obs.subscribeOnce(\'evt\', { onEvent: () => count++ });',
    '      obs.emit(\'evt\', 1); obs.emit(\'evt\', 2);',
    '      expect(count).toBe(1);',
    '    });',
    '',
    '    it(\'should log events\', () => {',
    '      var obs = new ' + p + 'EventObserver();',
    '      obs.emit(\'a\', 1); obs.emit(\'b\', 2);',
    '      expect(obs.getEventLog().length).toBe(2);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'ProcessingPipeline\', () => {',
    '    it(\'should execute stages in order\', async () => {',
    '      var pipe = new ' + p + 'ProcessingPipeline();',
    '      var order: string[] = [];',
    '      pipe.addStage(\'one\', async (ctx) => order.push(\'one\'));',
    '      pipe.addStage(\'two\', async (ctx) => order.push(\'two\'));',
    '      await pipe.execute(\'test\');',
    '      expect(order).toEqual([\'one\', \'two\']);',
    '    });',
    '',
    '    it(\'should stop on error without handler\', async () => {',
    '      var pipe = new ' + p + 'ProcessingPipeline();',
    '      pipe.addStage(\'fail\', async () => { throw new Error(\'boom\'); });',
    '      pipe.addStage(\'after\', async () => {});',
    '      var ctx = await pipe.execute(\'test\');',
    '      expect(ctx.error).toBe(\'boom\');',
    '    });',
    '',
    '    it(\'should continue if error handler returns true\', async () => {',
    '      var pipe = new ' + p + 'ProcessingPipeline();',
    '      pipe.addStage(\'fail\', async () => { throw new Error(\'boom\'); }, async () => true);',
    '      pipe.addStage(\'after\', async (ctx) => { ctx.output = \'done\'; });',
    '      var ctx = await pipe.execute(\'test\');',
    '      expect(ctx.output).toBe(\'done\');',
    '    });',
    '  });',
    '',
    '  describe(\'Decorators\', () => {',
    '    var mockComponent: I' + p + 'Component = {',
    '      getName: () => \'mock\',',
    '      execute: async (input) => ({ success: true, data: input }),',
    '    };',
    '',
    '    it(\'LoggingDecorator should log execution\', async () => {',
    '      var dec = new ' + p + 'LoggingDecorator(mockComponent);',
    '      await dec.execute(\'test\');',
    '      expect(dec.getLogs().length).toBeGreaterThan(0);',
    '    });',
    '',
    '    it(\'CachingDecorator should cache results\', async () => {',
    '      var dec = new ' + p + 'CachingDecorator(mockComponent);',
    '      await dec.execute(\'test\');',
    '      await dec.execute(\'test\');',
    '      expect(dec.getHits()).toBe(1);',
    '      expect(dec.getMisses()).toBe(1);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'EventHandler\', () => {',
    '    it(\'should dispatch to handlers\', async () => {',
    '      var handler = new ' + p + 'EventHandler();',
    '      var received: string[] = [];',
    '      handler.on(\'test\', async (e) => received.push(e.type));',
    '      await handler.dispatch({ type: \'test\', payload: {}, timestamp: Date.now(), source: \'unit\' });',
    '      expect(received).toContain(\'test\');',
    '    });',
    '',
    '    it(\'should call global handlers\', async () => {',
    '      var handler = new ' + p + 'EventHandler();',
    '      var count = 0;',
    '      handler.onAny(async () => count++);',
    '      await handler.dispatch({ type: \'a\', payload: {}, timestamp: 0, source: \'\' });',
    '      await handler.dispatch({ type: \'b\', payload: {}, timestamp: 0, source: \'\' });',
    '      expect(count).toBe(2);',
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

var stats = { policies: 0, specs: 0, observers: 0, pipelines: 0, decorators: 0, handlers: 0, tests: 0 };

for (var i = 0; i < layers.length; i++) {
  var info = {
    pascal: toPascalCase(layers[i]),
    kebab: layers[i],
    baseDir: path.join(LAYERS_DIR, layers[i]),
  };

  try { generatePolicies(info); stats.policies++; } catch (e) { console.error('  policies failed for ' + layers[i] + ': ' + e.message); }
  try { generateSpecifications(info); stats.specs++; } catch (e) { console.error('  specs failed for ' + layers[i] + ': ' + e.message); }
  try { generateObserver(info); stats.observers++; } catch (e) { console.error('  observer failed for ' + layers[i] + ': ' + e.message); }
  try { generatePipeline(info); stats.pipelines++; } catch (e) { console.error('  pipeline failed for ' + layers[i] + ': ' + e.message); }
  try { generateDecorators(info); stats.decorators++; } catch (e) { console.error('  decorators failed for ' + layers[i] + ': ' + e.message); }
  try { generateEventHandler(info); stats.handlers++; } catch (e) { console.error('  event handler failed for ' + layers[i] + ': ' + e.message); }
  try { generatePatternTests(info); stats.tests++; } catch (e) { console.error('  tests failed for ' + layers[i] + ': ' + e.message); }
}

console.log('\nDone!');
console.log('Policies: ' + stats.policies);
console.log('Specifications: ' + stats.specs);
console.log('Observers: ' + stats.observers);
console.log('Pipelines: ' + stats.pipelines);
console.log('Decorators: ' + stats.decorators);
console.log('Event handlers: ' + stats.handlers);
console.log('Tests: ' + stats.tests);
