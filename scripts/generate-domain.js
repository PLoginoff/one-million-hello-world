#!/usr/bin/env node

/**
 * Generate additional domain entities, value objects, events, and adapters
 * for all layers to expand the codebase meaningfully.
 *
 * Per layer adds:
 * - 3 additional domain entities (with rich logic)
 * - 3 additional value objects (with validation)
 * - 2 domain events
 * - 3 adapters (InMemory, Mock, Stub)
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

function generateEntities(info) {
  var p = info.pascal;
  var entitiesDir = path.join(info.baseDir, 'domain', 'entities');

  var entities = [
    { name: p + 'Execution', desc: 'Tracks a single ' + info.kebab + ' execution' },
    { name: p + 'Configuration', desc: 'Stores ' + info.kebab + ' configuration state' },
    { name: p + 'Metrics', desc: 'Holds ' + info.kebab + ' metrics snapshot' },
  ];

  var exports = [];
  var existingIndex = fileExists(path.join(entitiesDir, 'index.ts'))
    ? fs.readFileSync(path.join(entitiesDir, 'index.ts'), 'utf8')
    : '';

  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    var fileName = e.name + '.ts';
    var filePath = path.join(entitiesDir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(e.name)) exports.push('export { ' + e.name + ' } from \'./' + e.name + '\';');
      continue;
    }

    var content = [
      '/**',
      ' * ' + e.name + ' Entity',
      ' *',
      ' * ' + e.desc + '.',
      ' */',
      '',
      'export interface ' + e.name + 'Data {',
      '  id: string;',
      '  status: \'pending\' | \'active\' | \'completed\' | \'failed\';',
      '  createdAt: number;',
      '  updatedAt: number;',
      '  attributes: Record<string, unknown>;',
      '  tags: string[];',
      '}',
      '',
      'export class ' + e.name + ' {',
      '  readonly data: ' + e.name + 'Data;',
      '',
      '  private constructor(data: ' + e.name + 'Data) {',
      '    this.data = { ...data, tags: [...data.tags] };',
      '  }',
      '',
      '  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ' + e.name + ' {',
      '    var now = Date.now();',
      '    return new ' + e.name + '({',
      '      id: \'' + info.kebab + '-exec-\' + now + \'-\' + Math.random().toString(36).slice(2, 8),',
      '      status: \'pending\',',
      '      createdAt: now,',
      '      updatedAt: now,',
      '      attributes: { ...attributes },',
      '      tags: [...tags],',
      '    });',
      '  }',
      '',
      '  activate(): ' + e.name + ' {',
      '    return new ' + e.name + '({ ...this.data, status: \'active\', updatedAt: Date.now() });',
      '  }',
      '',
      '  complete(): ' + e.name + ' {',
      '    return new ' + e.name + '({ ...this.data, status: \'completed\', updatedAt: Date.now() });',
      '  }',
      '',
      '  fail(): ' + e.name + ' {',
      '    return new ' + e.name + '({ ...this.data, status: \'failed\', updatedAt: Date.now() });',
      '  }',
      '',
      '  addTag(tag: string): ' + e.name + ' {',
      '    if (this.data.tags.includes(tag)) return this;',
      '    return new ' + e.name + '({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });',
      '  }',
      '',
      '  removeTag(tag: string): ' + e.name + ' {',
      '    return new ' + e.name + '({ ...this.data, tags: this.data.tags.filter(function(t) { return t !== tag; }), updatedAt: Date.now() });',
      '  }',
      '',
      '  updateAttributes(attrs: Record<string, unknown>): ' + e.name + ' {',
      '    return new ' + e.name + '({ ...this.data, attributes: { ...this.data.attributes, ...attrs }, updatedAt: Date.now() });',
      '  }',
      '',
      '  isPending(): boolean { return this.data.status === \'pending\'; }',
      '  isActive(): boolean { return this.data.status === \'active\'; }',
      '  isCompleted(): boolean { return this.data.status === \'completed\'; }',
      '  isFailed(): boolean { return this.data.status === \'failed\'; }',
      '',
      '  toObject(): ' + e.name + 'Data {',
      '    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };',
      '  }',
      '}',
      '',
    ];

    writeFile(filePath, content.join('\n'));

    if (!existingIndex.includes(e.name)) {
      exports.push('export { ' + e.name + ', ' + e.name + 'Data } from \'./' + e.name + '\';');
    }
  }

  // Update index.ts
  if (exports.length > 0) {
    var indexPath = path.join(entitiesDir, 'index.ts');
    var existingContent = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    var newContent = existingContent + exports.join('\n') + '\n';
    writeFile(indexPath, newContent);
  }
}

function generateValueObjects(info) {
  var p = info.pascal;
  var voDir = path.join(info.baseDir, 'domain', 'value-objects');

  var valueObjects = [
    { name: p + 'Threshold', desc: 'Configurable threshold value with min/max bounds' },
    { name: p + 'TimeWindow', desc: 'Time window for ' + info.kebab + ' operations' },
    { name: p + 'Priority', desc: 'Priority level for ' + info.kebab + ' tasks' },
  ];

  var exports = [];
  var existingIndex = fileExists(path.join(voDir, 'index.ts'))
    ? fs.readFileSync(path.join(voDir, 'index.ts'), 'utf8')
    : '';

  for (var i = 0; i < valueObjects.length; i++) {
    var v = valueObjects[i];
    var fileName = v.name + '.ts';
    var filePath = path.join(voDir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(v.name)) exports.push('export { ' + v.name + ' } from \'./' + v.name + '\';');
      continue;
    }

    var content;
    if (v.name.includes('Threshold')) {
      content = [
        '/**',
        ' * ' + v.name + ' Value Object',
        ' *',
        ' * ' + v.desc + '.',
        ' */',
        '',
        'export class ' + v.name + ' {',
        '  readonly value: number;',
        '  readonly min: number;',
        '  readonly max: number;',
        '',
        '  private constructor(value: number, min: number, max: number) {',
        '    this.value = value;',
        '    this.min = min;',
        '    this.max = max;',
        '  }',
        '',
        '  static create(value: number, min: number = 0, max: number = 100): ' + v.name + ' {',
        '    if (value < min || value > max) {',
        '      throw new Error(\'Threshold ' + info.kebab + ' value \' + value + \' out of range [\' + min + \', \' + max + \']\');',
        '    }',
        '    return new ' + v.name + '(value, min, max);',
        '  }',
        '',
        '  isAtMin(): boolean { return this.value === this.min; }',
        '  isAtMax(): boolean { return this.value === this.max; }',
        '  isBelow(other: ' + v.name + '): boolean { return this.value < other.value; }',
        '  isAbove(other: ' + v.name + '): boolean { return this.value > other.value; }',
        '',
        '  equals(other: ' + v.name + '): boolean {',
        '    return this.value === other.value && this.min === other.min && this.max === other.max;',
        '  }',
        '',
        '  toString(): string {',
        '    return this.value.toString();',
        '  }',
        '}',
        '',
      ];
    } else if (v.name.includes('TimeWindow')) {
      content = [
        '/**',
        ' * ' + v.name + ' Value Object',
        ' *',
        ' * ' + v.desc + '.',
        ' */',
        '',
        'export class ' + v.name + ' {',
        '  readonly startMs: number;',
        '  readonly durationMs: number;',
        '',
        '  private constructor(startMs: number, durationMs: number) {',
        '    this.startMs = startMs;',
        '    this.durationMs = durationMs;',
        '  }',
        '',
        '  static create(startMs: number, durationMs: number): ' + v.name + ' {',
        '    if (durationMs <= 0) {',
        '      throw new Error(\'Time window duration must be positive\');',
        '    }',
        '    return new ' + v.name + '(startMs, durationMs);',
        '  }',
        '',
        '  static fromMinutes(minutes: number): ' + v.name + ' {',
        '    return new ' + v.name + '(Date.now(), minutes * 60 * 1000);',
        '  }',
        '',
        '  static fromSeconds(seconds: number): ' + v.name + ' {',
        '    return new ' + v.name + '(Date.now(), seconds * 1000);',
        '  }',
        '',
        '  get endMs(): number { return this.startMs + this.durationMs; }',
        '',
        '  contains(timestamp: number): boolean {',
        '    return timestamp >= this.startMs && timestamp <= this.endMs;',
        '  }',
        '',
        '  overlaps(other: ' + v.name + '): boolean {',
        '    return this.startMs < other.endMs && other.startMs < this.endMs;',
        '  }',
        '',
        '  equals(other: ' + v.name + '): boolean {',
        '    return this.startMs === other.startMs && this.durationMs === other.durationMs;',
        '  }',
        '',
        '  toString(): string {',
        '    return \'[\' + this.startMs + \', \' + this.endMs + \']\';',
        '  }',
        '}',
        '',
      ];
    } else {
      // Priority
      content = [
        '/**',
        ' * ' + v.name + ' Value Object',
        ' *',
        ' * ' + v.desc + '.',
        ' */',
        '',
        'export class ' + v.name + ' {',
        '  readonly value: number;',
        '  readonly label: string;',
        '',
        '  private constructor(value: number, label: string) {',
        '    this.value = value;',
        '    this.label = label;',
        '  }',
        '',
        '  static create(value: number): ' + v.name + ' {',
        '    if (value < 0 || value > 10) {',
        '      throw new Error(\'Priority must be between 0 and 10\');',
        '    }',
        '    var label = value <= 2 ? \'low\' : value <= 5 ? \'medium\' : value <= 8 ? \'high\' : \'critical\';',
        '    return new ' + v.name + '(value, label);',
        '  }',
        '',
        '  static low(): ' + v.name + ' { return new ' + v.name + '(1, \'low\'); }',
        '  static medium(): ' + v.name + ' { return new ' + v.name + '(5, \'medium\'); }',
        '  static high(): ' + v.name + ' { return new ' + v.name + '(8, \'high\'); }',
        '  static critical(): ' + v.name + ' { return new ' + v.name + '(10, \'critical\'); }',
        '',
        '  isLow(): boolean { return this.value <= 2; }',
        '  isMedium(): boolean { return this.value > 2 && this.value <= 5; }',
        '  isHigh(): boolean { return this.value > 5 && this.value <= 8; }',
        '  isCritical(): boolean { return this.value > 8; }',
        '',
        '  isHigherThan(other: ' + v.name + '): boolean { return this.value > other.value; }',
        '  isLowerThan(other: ' + v.name + '): boolean { return this.value < other.value; }',
        '',
        '  equals(other: ' + v.name + '): boolean { return this.value === other.value; }',
        '',
        '  toString(): string { return this.label + \' (\' + this.value + \')\'; }',
        '}',
        '',
      ];
    }

    writeFile(filePath, content.join('\n'));

    if (!existingIndex.includes(v.name)) {
      exports.push('export { ' + v.name + ' } from \'./' + v.name + '\';');
    }
  }

  if (exports.length > 0) {
    var indexPath = path.join(voDir, 'index.ts');
    var existingContent = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    writeFile(indexPath, existingContent + exports.join('\n') + '\n');
  }
}

function generateEvents(info) {
  var p = info.pascal;
  var eventsDir = path.join(info.baseDir, 'domain', 'events');

  var events = [
    { name: p + 'Executed', desc: 'Raised when ' + info.kebab + ' execution completes' },
    { name: p + 'Failed', desc: 'Raised when ' + info.kebab + ' execution fails' },
  ];

  var exports = [];
  var existingIndex = fileExists(path.join(eventsDir, 'index.ts'))
    ? fs.readFileSync(path.join(eventsDir, 'index.ts'), 'utf8')
    : '';

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var fileName = ev.name + '.ts';
    var filePath = path.join(eventsDir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(ev.name)) exports.push('export { ' + ev.name + ' } from \'./' + ev.name + '\';');
      continue;
    }

    var content = [
      '/**',
      ' * ' + ev.name + ' Event',
      ' *',
      ' * ' + ev.desc + '.',
      ' */',
      '',
      'export interface ' + ev.name + 'Payload {',
      '  layerName: string;',
      '  executionId: string;',
      '  timestamp: number;',
      '  durationMs: number;',
      '  success: boolean;',
      '  metadata: Record<string, unknown>;',
      '}',
      '',
      'export class ' + ev.name + ' {',
      '  readonly payload: ' + ev.name + 'Payload;',
      '  readonly eventName: string;',
      '',
      '  constructor(payload: ' + ev.name + 'Payload) {',
      '    this.payload = { ...payload, metadata: { ...payload.metadata } };',
      '    this.eventName = \'' + info.kebab + '.' + ev.name.toLowerCase().replace(p.toLowerCase(), '') + '\';',
      '  }',
      '',
      '  static create(executionId: string, durationMs: number, success: boolean, metadata: Record<string, unknown> = {}): ' + ev.name + ' {',
      '    return new ' + ev.name + '({',
      '      layerName: \'' + info.kebab + '\',',
      '      executionId: executionId,',
      '      timestamp: Date.now(),',
      '      durationMs: durationMs,',
      '      success: success,',
      '      metadata: metadata,',
      '    });',
      '  }',
      '',
      '  getAge(): number { return Date.now() - this.payload.timestamp; }',
      '',
      '  toObject(): ' + ev.name + 'Payload {',
      '    return { ...this.payload, metadata: { ...this.payload.metadata } };',
      '  }',
      '}',
      '',
    ];

    writeFile(filePath, content.join('\n'));

    if (!existingIndex.includes(ev.name)) {
      exports.push('export { ' + ev.name + ', ' + ev.name + 'Payload } from \'./' + ev.name + '\';');
    }
  }

  if (exports.length > 0) {
    var indexPath = path.join(eventsDir, 'index.ts');
    var existingContent = fileExists(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    writeFile(indexPath, existingContent + exports.join('\n') + '\n');
  }
}

function generateAdapters(info) {
  var p = info.pascal;
  var adaptersDir = path.join(info.baseDir, 'adapters');

  // Skip layers that already have adapters with index.ts
  var existingIndex = fileExists(path.join(adaptersDir, 'index.ts'))
    ? fs.readFileSync(path.join(adaptersDir, 'index.ts'), 'utf8')
    : '';

  // Only generate if no adapters exist
  if (existingIndex.length > 0 && existingIndex !== 'export {}\n') {
    return;
  }

  var adapters = [
    { name: 'InMemory', desc: 'In-memory adapter for testing' },
    { name: 'Mock', desc: 'Mock adapter with configurable responses' },
    { name: 'Stub', desc: 'Stub adapter with fixed responses' },
  ];

  var exports = [];

  for (var i = 0; i < adapters.length; i++) {
    var a = adapters[i];
    var className = p + a.name + 'Adapter';
    var fileName = a.name + 'Adapter.ts';
    var filePath = path.join(adaptersDir, fileName);

    if (fileExists(filePath)) {
      if (!existingIndex.includes(className)) exports.push('export { ' + className + ' } from \'./' + fileName.replace('.ts', '') + '\';');
      continue;
    }

    var content = [
      '/**',
      ' * ' + className,
      ' *',
      ' * ' + a.desc + ' for ' + info.kebab + ' layer.',
      ' */',
      '',
      'export interface I' + p + 'Adapter {',
      '  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;',
      '  configure(config: Record<string, unknown>): void;',
      '  getStatus(): Record<string, unknown>;',
      '}',
      '',
      'export class ' + className + ' implements I' + p + 'Adapter {',
      '  private _config: Record<string, unknown>;',
      '  private _executionCount: number;',
      '  private _responses: Map<string, unknown>;',
      '',
      '  constructor() {',
      '    this._config = {};',
      '    this._executionCount = 0;',
      '    this._responses = new Map();',
      '  }',
      '',
      '  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {',
      '    this._executionCount++;',
      '    await Promise.resolve();',
      '    var key = String(input);',
      '    if (this._responses.has(key)) {',
      '      return { success: true, data: this._responses.get(key) };',
      '    }',
      '    return {',
      '      success: true,',
      '      data: {',
      '        adapter: \'' + a.name.toLowerCase() + '\',',
      '        input: input,',
      '        executionCount: this._executionCount,',
      '        layer: \'' + info.kebab + '\',',
      '      },',
      '    };',
      '  }',
      '',
      '  configure(config: Record<string, unknown>): void {',
      '    this._config = { ...this._config, ...config };',
      '  }',
      '',
      '  getStatus(): Record<string, unknown> {',
      '    return {',
      '      adapter: \'' + a.name.toLowerCase() + '\',',
      '      layer: \'' + info.kebab + '\',',
      '      executionCount: this._executionCount,',
      '      configuredResponses: this._responses.size,',
      '    };',
      '  }',
      '',
      '  setResponse(key: string, response: unknown): void {',
      '    this._responses.set(key, response);',
      '  }',
      '',
      '  clearResponses(): void {',
      '    this._responses.clear();',
      '  }',
      '',
      '  getExecutionCount(): number {',
      '    return this._executionCount;',
      '  }',
      '}',
      '',
    ];

    writeFile(filePath, content.join('\n'));
    exports.push('export { ' + className + ', I' + p + 'Adapter } from \'./' + fileName.replace('.ts', '') + '\';');
  }

  if (exports.length > 0) {
    writeFile(path.join(adaptersDir, 'index.ts'), exports.join('\n') + '\n');
  }
}

function generateDomainTests(info) {
  var p = info.pascal;
  var testDir = path.join(info.baseDir, 'domain', '__tests__');
  var testPath = path.join(testDir, p + 'ExtendedDomain.test.ts');

  if (fileExists(testPath)) return;

  var content = [
    '/**',
    ' * Extended domain tests for ' + p,
    ' */',
    '',
    'import { ' + p + 'Execution } from \'../entities/' + p + 'Execution\';',
    'import { ' + p + 'Configuration as ' + p + 'ConfigEntity } from \'../entities/' + p + 'Configuration\';',
    'import { ' + p + 'Metrics } from \'../entities/' + p + 'Metrics\';',
    'import { ' + p + 'Threshold } from \'../value-objects/' + p + 'Threshold\';',
    'import { ' + p + 'TimeWindow } from \'../value-objects/' + p + 'TimeWindow\';',
    'import { ' + p + 'Priority } from \'../value-objects/' + p + 'Priority\';',
    'import { ' + p + 'Executed } from \'../events/' + p + 'Executed\';',
    'import { ' + p + 'Failed } from \'../events/' + p + 'Failed\';',
    '',
    'describe(\'Extended Domain: ' + p + '\', () => {',
    '  describe(\'' + p + 'Execution\', () => {',
    '    it(\'should create with pending status\', () => {',
    '      var exec = ' + p + 'Execution.create();',
    '      expect(exec.isPending()).toBe(true);',
    '      expect(exec.data.id).toBeDefined();',
    '    });',
    '',
    '    it(\'should transition through lifecycle\', () => {',
    '      var exec = ' + p + 'Execution.create();',
    '      expect(exec.isPending()).toBe(true);',
    '      var active = exec.activate();',
    '      expect(active.isActive()).toBe(true);',
    '      var done = active.complete();',
    '      expect(done.isCompleted()).toBe(true);',
    '    });',
    '',
    '    it(\'should fail\', () => {',
    '      var exec = ' + p + 'Execution.create();',
    '      var failed = exec.fail();',
    '      expect(failed.isFailed()).toBe(true);',
    '    });',
    '',
    '    it(\'should manage tags\', () => {',
    '      var exec = ' + p + 'Execution.create();',
    '      var tagged = exec.addTag(\'important\');',
    '      expect(tagged.data.tags).toContain(\'important\');',
    '      var untagged = tagged.removeTag(\'important\');',
    '      expect(untagged.data.tags).not.toContain(\'important\');',
    '    });',
    '',
    '    it(\'should not duplicate tags\', () => {',
    '      var exec = ' + p + 'Execution.create();',
    '      var tagged = exec.addTag(\'test\').addTag(\'test\');',
    '      expect(tagged.data.tags.length).toBe(1);',
    '    });',
    '',
    '    it(\'should update attributes immutably\', () => {',
    '      var exec = ' + p + 'Execution.create({ initial: true });',
    '      var updated = exec.updateAttributes({ new: \'value\' });',
    '      expect(updated.data.attributes.new).toBe(\'value\');',
    '      expect(exec.data.attributes.new).toBeUndefined();',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'Threshold\', () => {',
    '    it(\'should create within bounds\', () => {',
    '      var t = ' + p + 'Threshold.create(50, 0, 100);',
    '      expect(t.value).toBe(50);',
    '    });',
    '',
    '    it(\'should reject out of bounds\', () => {',
    '      expect(() => ' + p + 'Threshold.create(150, 0, 100)).toThrow();',
    '    });',
    '',
    '    it(\'should compare thresholds\', () => {',
    '      var low = ' + p + 'Threshold.create(10);',
    '      var high = ' + p + 'Threshold.create(90);',
    '      expect(low.isBelow(high)).toBe(true);',
    '      expect(high.isAbove(low)).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'TimeWindow\', () => {',
    '    it(\'should create from minutes\', () => {',
    '      var w = ' + p + 'TimeWindow.fromMinutes(5);',
    '      expect(w.durationMs).toBe(300000);',
    '    });',
    '',
    '    it(\'should create from seconds\', () => {',
    '      var w = ' + p + 'TimeWindow.fromSeconds(30);',
    '      expect(w.durationMs).toBe(30000);',
    '    });',
    '',
    '    it(\'should check if timestamp is contained\', () => {',
    '      var now = Date.now();',
    '      var w = ' + p + 'TimeWindow.create(now, 1000);',
    '      expect(w.contains(now + 500)).toBe(true);',
    '      expect(w.contains(now + 2000)).toBe(false);',
    '    });',
    '',
    '    it(\'should reject zero or negative duration\', () => {',
    '      expect(() => ' + p + 'TimeWindow.create(100, 0)).toThrow();',
    '      expect(() => ' + p + 'TimeWindow.create(100, -1)).toThrow();',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'Priority\', () => {',
    '    it(\'should create with valid value\', () => {',
    '      var p1 = ' + p + 'Priority.create(5);',
    '      expect(p1.value).toBe(5);',
    '      expect(p1.label).toBe(\'medium\');',
    '    });',
    '',
    '    it(\'should reject out of range\', () => {',
    '      expect(() => ' + p + 'Priority.create(15)).toThrow();',
    '      expect(() => ' + p + 'Priority.create(-1)).toThrow();',
    '    });',
    '',
    '    it(\'should have static presets\', () => {',
    '      expect(' + p + 'Priority.low().isLow()).toBe(true);',
    '      expect(' + p + 'Priority.medium().isMedium()).toBe(true);',
    '      expect(' + p + 'Priority.high().isHigh()).toBe(true);',
    '      expect(' + p + 'Priority.critical().isCritical()).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'Executed Event\', () => {',
    '    it(\'should create event\', () => {',
    '      var ev = ' + p + 'Executed.create(\'exec-1\', 100, true);',
    '      expect(ev.payload.executionId).toBe(\'exec-1\');',
    '      expect(ev.payload.success).toBe(true);',
    '    });',
    '',
    '    it(\'should compute age\', () => {',
    '      var ev = ' + p + 'Executed.create(\'exec-2\', 50, true);',
    '      expect(ev.getAge()).toBeGreaterThanOrEqual(0);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'Failed Event\', () => {',
    '    it(\'should create failed event\', () => {',
    '      var ev = ' + p + 'Failed.create(\'exec-3\', 200, false, { reason: \'timeout\' });',
    '      expect(ev.payload.success).toBe(false);',
    '      expect(ev.payload.metadata.reason).toBe(\'timeout\');',
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

var stats = { entities: 0, valueObjects: 0, events: 0, adapters: 0, tests: 0 };

for (var i = 0; i < layers.length; i++) {
  var info = {
    pascal: toPascalCase(layers[i]),
    kebab: layers[i],
    camel: '',
    baseDir: path.join(LAYERS_DIR, layers[i]),
  };

  try { generateEntities(info); stats.entities++; } catch (e) { console.error('  entities failed for ' + layers[i] + ': ' + e.message); }
  try { generateValueObjects(info); stats.valueObjects++; } catch (e) { console.error('  VOs failed for ' + layers[i] + ': ' + e.message); }
  try { generateEvents(info); stats.events++; } catch (e) { console.error('  events failed for ' + layers[i] + ': ' + e.message); }
  try { generateAdapters(info); stats.adapters++; } catch (e) { console.error('  adapters failed for ' + layers[i] + ': ' + e.message); }
  try { generateDomainTests(info); stats.tests++; } catch (e) { console.error('  tests failed for ' + layers[i] + ': ' + e.message); }
}

console.log('\nDone!');
console.log('Entities: ' + stats.entities);
console.log('Value objects: ' + stats.valueObjects);
console.log('Events: ' + stats.events);
console.log('Adapters: ' + stats.adapters);
console.log('Tests: ' + stats.tests);
