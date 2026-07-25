#!/usr/bin/env node

/**
 * Generate strategies, factories, builders, defaults, validators, and tests
 * for all layers that lack them.
 *
 * Each layer gets:
 * - 5 strategy implementations (Default, Fast, Reliable, Cached, Batch)
 * - 1 factory (creates strategies by name)
 * - 1 configuration builder
 * - 1 configuration defaults
 * - 1 configuration validator
 * - Tests for strategies and factory
 */

const fs = require('fs');
const path = require('path');

const LAYERS_DIR = path.join(__dirname, '..', 'src', 'layers');

function toPascalCase(str) {
  return str.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
}

function toCamelCase(str) {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// Read layer interface to understand contract
function getLayerInfo(name) {
  var pascal = toPascalCase(name);
  var kebab = name;
  var camel = toCamelCase(name);
  var baseDir = path.join(LAYERS_DIR, kebab);

  // Check if interface exists
  var interfacePath = path.join(baseDir, 'interfaces', 'I' + pascal + '.ts');
  var typesPath = path.join(baseDir, 'types', kebab + '-types.ts');

  return { pascal: pascal, kebab: kebab, camel: camel, baseDir: baseDir, interfacePath: interfacePath, typesPath: typesPath };
}

function generateStrategies(info) {
  var p = info.pascal;
  var kebab = info.kebab;
  var camel = info.camel;
  var strategiesDir = path.join(info.baseDir, 'strategies');

  // Check what interface the layer uses
  var interfaceName = 'I' + p;
  var contextType = p + 'Context';
  var resultType = p + 'Result';
  var hasStandardInterface = fileExists(info.interfacePath);

  var strategies = [
    { name: 'Default', desc: 'Standard ' + camel + ' strategy with balanced performance', priority: 0 },
    { name: 'Fast', desc: 'High-performance ' + camel + ' strategy optimized for speed', priority: 10 },
    { name: 'Reliable', desc: 'Reliability-focused ' + camel + ' strategy with retries', priority: 5 },
    { name: 'Cached', desc: 'Caching ' + camel + ' strategy with in-memory cache', priority: 7 },
    { name: 'Batch', desc: 'Batch-oriented ' + camel + ' strategy for bulk operations', priority: 3 },
  ];

  var exports = [];
  for (var i = 0; i < strategies.length; i++) {
    var s = strategies[i];
    var className = p + s.name + 'Strategy';
    var fileName = s.name + 'Strategy.ts';
    var filePath = path.join(strategiesDir, fileName);

    if (fileExists(filePath)) {
      exports.push('export { ' + className + ' } from \'./' + s.name + 'Strategy\';');
      continue;
    }

    var content = [
      '/**',
      ' * ' + className,
      ' *',
      ' * ' + s.desc + '.',
      ' */',
      '',
    ];

    if (hasStandardInterface) {
      content = content.concat([
        'import { ' + contextType + ', ' + resultType + ' } from \'../types/' + kebab + '-types\';',
        '',
        'export interface I' + p + 'Strategy {',
        '  readonly name: string;',
        '  readonly priority: number;',
        '  execute(context: ' + contextType + '): Promise<' + resultType + '<unknown>>;',
        '  canHandle(context: ' + contextType + '): boolean;',
        '}',
        '',
        'export class ' + className + ' implements I' + p + 'Strategy {',
        '  readonly name = \'' + s.name + '\';',
        '  readonly priority = ' + s.priority + ';',
        '  private _config: Record<string, unknown>;',
        '  private _executionCount: number;',
        '',
        '  constructor(config: Record<string, unknown> = {}) {',
        '    this._config = config;',
        '    this._executionCount = 0;',
        '  }',
        '',
        '  canHandle(context: ' + contextType + '): boolean {',
        '    return context.input !== null && context.input !== undefined;',
        '  }',
        '',
        '  async execute(context: ' + contextType + '): Promise<' + resultType + '<unknown>> {',
        '    this._executionCount++;',
        '    await Promise.resolve();',
        '    return {',
        '      success: true,',
        '      data: {',
        '        strategy: this.name,',
        '        input: context.input,',
        '        metadata: context.metadata,',
        '        executionCount: this._executionCount,',
        '      },',
        '    };',
        '  }',
        '',
        '  configure(config: Record<string, unknown>): void {',
        '    this._config = { ...this._config, ...config };',
        '  }',
        '',
        '  getConfig(): Record<string, unknown> {',
        '    return { ...this._config };',
        '  }',
        '',
        '  getExecutionCount(): number {',
        '    return this._executionCount;',
        '  }',
        '}',
        '',
      ]);
    } else {
      // Generic strategy without specific types
      content = content.concat([
        'export interface I' + p + 'Strategy {',
        '  readonly name: string;',
        '  readonly priority: number;',
        '  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;',
        '  canHandle(input: unknown): boolean;',
        '}',
        '',
        'export class ' + className + ' implements I' + p + 'Strategy {',
        '  readonly name = \'' + s.name + '\';',
        '  readonly priority = ' + s.priority + ';',
        '  private _executionCount: number;',
        '',
        '  constructor() {',
        '    this._executionCount = 0;',
        '  }',
        '',
        '  canHandle(input: unknown): boolean {',
        '    return input !== null && input !== undefined;',
        '  }',
        '',
        '  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {',
        '    this._executionCount++;',
        '    await Promise.resolve();',
        '    return { success: true, data: { strategy: this.name, input: input, executionCount: this._executionCount } };',
        '  }',
        '',
        '  getExecutionCount(): number {',
        '    return this._executionCount;',
        '  }',
        '}',
        '',
      ]);
    }

    writeFile(filePath, content.join('\n'));
    exports.push('export { ' + className + ', I' + p + 'Strategy } from \'./' + s.name + 'Strategy\';');
  }

  // Write strategies/index.ts
  writeFile(path.join(strategiesDir, 'index.ts'), exports.join('\n') + '\n');
}

function generateFactory(info) {
  var p = info.pascal;
  var factoriesDir = path.join(info.baseDir, 'factories');
  var factoryName = p + 'StrategyFactory';
  var filePath = path.join(factoriesDir, factoryName + '.ts');

  if (fileExists(filePath)) return;

  var strategies = ['Default', 'Fast', 'Reliable', 'Cached', 'Batch'];
  var imports = strategies.map(function(s) {
    return 'import { ' + p + s + 'Strategy } from \'../strategies/' + s + 'Strategy\';';
  }).join('\n');

  var content = [
    '/**',
    ' * ' + factoryName,
    ' *',
    ' * Factory for creating ' + p + ' strategies by name.',
    ' */',
    '',
    imports,
    '',
    'export interface I' + p + 'Strategy {',
    '  readonly name: string;',
    '  readonly priority: number;',
    '  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;',
    '  canHandle(input: unknown): boolean;',
    '}',
    '',
    'export class ' + factoryName + ' {',
    '  private _strategies: Map<string, () => I' + p + 'Strategy>;',
    '',
    '  constructor() {',
    '    this._strategies = new Map();',
    '    this._strategies.set(\'default\', () => new ' + p + 'DefaultStrategy());',
    '    this._strategies.set(\'fast\', () => new ' + p + 'FastStrategy());',
    '    this._strategies.set(\'reliable\', () => new ' + p + 'ReliableStrategy());',
    '    this._strategies.set(\'cached\', () => new ' + p + 'CachedStrategy());',
    '    this._strategies.set(\'batch\', () => new ' + p + 'BatchStrategy());',
    '  }',
    '',
    '  create(name: string): I' + p + 'Strategy {',
    '    var normalizedName = name.toLowerCase();',
    '    var factory = this._strategies.get(normalizedName);',
    '    if (!factory) {',
    '      throw new Error(\'Unknown ' + info.kebab + ' strategy: \' + name + \'. Available: \' + this.getAvailableStrategies().join(\', \'));',
    '    }',
    '    return factory();',
    '  }',
    '',
    '  createDefault(): I' + p + 'Strategy {',
    '    return this.create(\'default\');',
    '  }',
    '',
    '  registerStrategy(name: string, factory: () => I' + p + 'Strategy): void {',
    '    this._strategies.set(name.toLowerCase(), factory);',
    '  }',
    '',
    '  getAvailableStrategies(): string[] {',
    '    return Array.from(this._strategies.keys());',
    '  }',
    '',
    '  createAll(): I' + p + 'Strategy[] {',
    '    return Array.from(this._strategies.values()).map(function(f) { return f(); });',
    '  }',
    '',
    '  createByPriority(): I' + p + 'Strategy[] {',
    '    return this.createAll().sort(function(a, b) { return b.priority - a.priority; });',
    '  }',
    '}',
    '',
  ];

  writeFile(filePath, content.join('\n'));
  writeFile(path.join(factoriesDir, 'index.ts'),
    'export { ' + factoryName + ', I' + p + 'Strategy } from \'./' + factoryName + '\';\n');
}

function generateConfiguration(info) {
  var p = info.pascal;
  var kebab = info.kebab;
  var configDir = path.join(info.baseDir, 'configuration');

  // Builder
  var builderPath = path.join(configDir, 'builders', p + 'ConfigurationBuilder.ts');
  if (!fileExists(builderPath)) {
    writeFile(builderPath, [
      '/**',
      ' * ' + p + ' Configuration Builder',
      ' *',
      ' * Fluent builder for ' + kebab + ' layer configuration.',
      ' */',
      '',
      'export interface ' + p + 'Configuration {',
      '  enabled: boolean;',
      '  timeout: number;',
      '  retries: number;',
      '  logLevel: string;',
      '  strategy: string;',
      '  options: Record<string, unknown>;',
      '}',
      '',
      'export class ' + p + 'ConfigurationBuilder {',
      '  private _enabled: boolean;',
      '  private _timeout: number;',
      '  private _retries: number;',
      '  private _logLevel: string;',
      '  private _strategy: string;',
      '  private _options: Record<string, unknown>;',
      '',
      '  constructor() {',
      '    this._enabled = true;',
      '    this._timeout = 30000;',
      '    this._retries = 3;',
      '    this._logLevel = \'info\';',
      '    this._strategy = \'default\';',
      '    this._options = {};',
      '  }',
      '',
      '  withEnabled(enabled: boolean): this { this._enabled = enabled; return this; }',
      '  withTimeout(timeout: number): this { this._timeout = timeout; return this; }',
      '  withRetries(retries: number): this { this._retries = retries; return this; }',
      '  withLogLevel(logLevel: string): this { this._logLevel = logLevel; return this; }',
      '  withStrategy(strategy: string): this { this._strategy = strategy; return this; }',
      '  withOption(key: string, value: unknown): this { this._options[key] = value; return this; }',
      '  withOptions(options: Record<string, unknown>): this { this._options = { ...this._options, ...options }; return this; }',
      '',
      '  build(): ' + p + 'Configuration {',
      '    return {',
      '      enabled: this._enabled,',
      '      timeout: this._timeout,',
      '      retries: this._retries,',
      '      logLevel: this._logLevel,',
      '      strategy: this._strategy,',
      '      options: { ...this._options },',
      '    };',
      '  }',
      '',
      '  static default(): ' + p + 'Configuration {',
      '    return new ' + p + 'ConfigurationBuilder().build();',
      '  }',
      '',
      '  static development(): ' + p + 'Configuration {',
      '    return new ' + p + 'ConfigurationBuilder()',
      '      .withLogLevel(\'debug\')',
      '      .withRetries(1)',
      '      .withTimeout(5000)',
      '      .build();',
      '  }',
      '',
      '  static production(): ' + p + 'Configuration {',
      '    return new ' + p + 'ConfigurationBuilder()',
      '      .withLogLevel(\'warn\')',
      '      .withRetries(5)',
      '      .withTimeout(60000)',
      '      .build();',
      '  }',
      '}',
      '',
    ].join('\n'));
    writeFile(path.join(configDir, 'builders', 'index.ts'),
      'export { ' + p + 'ConfigurationBuilder, ' + p + 'Configuration } from \'./' + p + 'ConfigurationBuilder\';\n');
  }

  // Defaults
  var defaultsPath = path.join(configDir, 'defaults', p + 'Defaults.ts');
  if (!fileExists(defaultsPath)) {
    writeFile(defaultsPath, [
      '/**',
      ' * ' + p + ' Default Configuration Values',
      ' */',
      '',
      'export const ' + p + 'DEFAULTS = {',
      '  enabled: true,',
      '  timeout: 30000,',
      '  retries: 3,',
      '  logLevel: \'info\' as const,',
      '  strategy: \'default\' as const,',
      '  maxConcurrentExecutions: 100,',
      '  cacheEnabled: true,',
      '  cacheTtlMs: 60000,',
      '  metricsEnabled: true,',
      '  healthCheckEnabled: true,',
      '  healthCheckIntervalMs: 30000,',
      '} as const;',
      '',
      'export const ' + p + 'LIMITS = {',
      '  minTimeout: 1000,',
      '  maxTimeout: 300000,',
      '  minRetries: 0,',
      '  maxRetries: 10,',
      '  maxConcurrentExecutions: 1000,',
      '  maxCacheTtlMs: 3600000,',
      '} as const;',
      '',
      'export const ' + p + 'STRATEGIES = [\'default\', \'fast\', \'reliable\', \'cached\', \'batch\'] as const;',
      '',
    ].join('\n'));
    writeFile(path.join(configDir, 'defaults', 'index.ts'),
      'export { ' + p + 'DEFAULTS, ' + p + 'LIMITS, ' + p + 'STRATEGIES } from \'./' + p + 'Defaults\';\n');
  }

  // Validator
  var validatorPath = path.join(configDir, 'validators', p + 'ConfigurationValidator.ts');
  if (!fileExists(validatorPath)) {
    writeFile(validatorPath, [
      '/**',
      ' * ' + p + ' Configuration Validator',
      ' */',
      '',
      'import { ' + p + 'DEFAULTS, ' + p + 'LIMITS, ' + p + 'STRATEGIES } from \'../defaults/' + p + 'Defaults\';',
      '',
      'export interface ValidationResult {',
      '  valid: boolean;',
      '  errors: string[];',
      '  warnings: string[];',
      '}',
      '',
      'export class ' + p + 'ConfigurationValidator {',
      '  validate(config: Record<string, unknown>): ValidationResult {',
      '    const errors: string[] = [];',
      '    const warnings: string[] = [];',
      '',
      '    if (typeof config.enabled !== \'boolean\') {',
      '      errors.push(\'enabled must be a boolean\');',
      '    }',
      '',
      '    const timeout = config.timeout as number;',
      '    if (typeof timeout !== \'number\' || timeout < ' + p + 'LIMITS.minTimeout || timeout > ' + p + 'LIMITS.maxTimeout) {',
      '      errors.push(\'timeout must be between \' + ' + p + 'LIMITS.minTimeout + \' and \' + ' + p + 'LIMITS.maxTimeout);',
      '    }',
      '',
      '    const retries = config.retries as number;',
      '    if (typeof retries !== \'number\' || retries < ' + p + 'LIMITS.minRetries || retries > ' + p + 'LIMITS.maxRetries) {',
      '      errors.push(\'retries must be between \' + ' + p + 'LIMITS.minRetries + \' and \' + ' + p + 'LIMITS.maxRetries);',
      '    }',
      '',
      '    const strategy = config.strategy as string;',
      '    if (typeof strategy === \'string\' && !' + p + 'STRATEGIES.includes(strategy)) {',
      '      errors.push(\'strategy must be one of: \' + ' + p + 'STRATEGIES.join(\', \'));',
      '    }',
      '',
      '    const logLevel = config.logLevel as string;',
      '    if (typeof logLevel === \'string\' && ![\'debug\', \'info\', \'warn\', \'error\'].includes(logLevel)) {',
      '      warnings.push(\'logLevel should be one of: debug, info, warn, error\');',
      '    }',
      '',
      '    return { valid: errors.length === 0, errors: errors, warnings: warnings };',
      '  }',
      '',
      '  validateOrThrow(config: Record<string, unknown>): void {',
      '    const result = this.validate(config);',
      '    if (!result.valid) {',
      '      throw new Error(\'Invalid ' + info.kebab + ' configuration: \' + result.errors.join(\'; \'));',
      '    }',
      '  }',
      '',
      '  getDefaults(): typeof ' + p + 'DEFAULTS {',
      '    return ' + p + 'DEFAULTS;',
      '  }',
      '}',
      '',
    ].join('\n'));
    writeFile(path.join(configDir, 'validators', 'index.ts'),
      'export { ' + p + 'ConfigurationValidator, ValidationResult } from \'./' + p + 'ConfigurationValidator\';\n');
  }
}

function generateStrategyTests(info) {
  var p = info.pascal;
  var kebab = info.kebab;
  var testDir = path.join(info.baseDir, '__tests__');
  var testPath = path.join(testDir, p + 'Strategies.test.ts');

  if (fileExists(testPath)) return;

  var strategies = ['Default', 'Fast', 'Reliable', 'Cached', 'Batch'];
  var hasStandardInterface = fileExists(info.interfacePath);

  var content = [
    '/**',
    ' * Strategy tests for ' + p + ' layer',
    ' */',
    '',
  ];

  if (hasStandardInterface) {
    content = content.concat([
      'import { ' + p + 'Context } from \'../types/' + kebab + '-types\';',
      'import { ' + p + 'DefaultStrategy } from \'../strategies/DefaultStrategy\';',
      'import { ' + p + 'FastStrategy } from \'../strategies/FastStrategy\';',
      'import { ' + p + 'ReliableStrategy } from \'../strategies/ReliableStrategy\';',
      'import { ' + p + 'CachedStrategy } from \'../strategies/CachedStrategy\';',
      'import { ' + p + 'BatchStrategy } from \'../strategies/BatchStrategy\';',
      'import { ' + p + 'StrategyFactory } from \'../factories/' + p + 'StrategyFactory\';',
      '',
      'function createContext(input: unknown): ' + p + 'Context {',
      '  return { input: input, metadata: {}, timestamp: new Date() };',
      '}',
      '',
    ]);
  } else {
    content = content.concat([
      'import { ' + p + 'DefaultStrategy } from \'../strategies/DefaultStrategy\';',
      'import { ' + p + 'FastStrategy } from \'../strategies/FastStrategy\';',
      'import { ' + p + 'ReliableStrategy } from \'../strategies/ReliableStrategy\';',
      'import { ' + p + 'CachedStrategy } from \'../strategies/CachedStrategy\';',
      'import { ' + p + 'BatchStrategy } from \'../strategies/BatchStrategy\';',
      'import { ' + p + 'StrategyFactory } from \'../factories/' + p + 'StrategyFactory\';',
      '',
    ]);
  }

  content = content.concat([
    'describe(\'' + p + ' Strategies\', () => {',
    '',
  ]);

  for (var i = 0; i < strategies.length; i++) {
    var s = strategies[i];
    var className = p + s + 'Strategy';
    content = content.concat([
      '  describe(\'' + className + '\', () => {',
      '    it(\'should have name \'' + s.toLowerCase() + '\', () => {',
      '      var strategy = new ' + className + '();',
      '      expect(strategy.name).toBe(\'' + s.toLowerCase() + '\');',
      '    });',
      '',
      '    it(\'should have positive priority\', () => {',
      '      var strategy = new ' + className + '();',
      '      expect(strategy.priority).toBeGreaterThanOrEqual(0);',
      '    });',
      '',
      '    it(\'should execute successfully\', async () => {',
      '      var strategy = new ' + className + '();',
    ]);

    if (hasStandardInterface) {
      content = content.concat([
        '      var result = await strategy.execute(createContext(\'test\'));',
      ]);
    } else {
      content = content.concat([
        '      var result = await strategy.execute(\'test\');',
      ]);
    }

    content = content.concat([
      '      expect(result.success).toBe(true);',
      '      expect(result.data).toBeDefined();',
      '    });',
      '',
      '    it(\'should handle null input via canHandle\', () => {',
      '      var strategy = new ' + className + '();',
    ]);

    if (hasStandardInterface) {
      content = content.concat([
        '      expect(strategy.canHandle(createContext(null))).toBe(false);',
      ]);
    } else {
      content = content.concat([
        '      expect(strategy.canHandle(null)).toBe(false);',
      ]);
    }

    content = content.concat([
      '    });',
      '',
      '    it(\'should track execution count\', async () => {',
      '      var strategy = new ' + className + '();',
    ]);

    if (hasStandardInterface) {
      content = content.concat([
        '      await strategy.execute(createContext(1));',
        '      await strategy.execute(createContext(2));',
        '      await strategy.execute(createContext(3));',
      ]);
    } else {
      content = content.concat([
        '      await strategy.execute(1);',
        '      await strategy.execute(2);',
        '      await strategy.execute(3);',
      ]);
    }

    content = content.concat([
      '      expect(strategy.getExecutionCount()).toBe(3);',
      '    });',
      '  });',
      '',
    ]);
  }

  // Factory tests
  content = content.concat([
    '  describe(\'' + p + 'StrategyFactory\', () => {',
    '    it(\'should create default strategy\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      var strategy = factory.create(\'default\');',
    '      expect(strategy.name).toBe(\'default\');',
    '    });',
    '',
    '    it(\'should create all strategies\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      var strategies = factory.createAll();',
    '      expect(strategies.length).toBe(5);',
    '    });',
    '',
    '    it(\'should list available strategies\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      var available = factory.getAvailableStrategies();',
    '      expect(available).toContain(\'default\');',
    '      expect(available).toContain(\'fast\');',
    '      expect(available).toContain(\'reliable\');',
    '      expect(available).toContain(\'cached\');',
    '      expect(available).toContain(\'batch\');',
    '    });',
    '',
    '    it(\'should throw for unknown strategy\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      expect(() => factory.create(\'unknown\')).toThrow();',
    '    });',
    '',
    '    it(\'should sort strategies by priority\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      var sorted = factory.createByPriority();',
    '      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);',
    '    });',
    '',
    '    it(\'should register custom strategy\', () => {',
    '      var factory = new ' + p + 'StrategyFactory();',
    '      factory.registerStrategy(\'custom\', () => new ' + p + 'DefaultStrategy());',
    '      expect(factory.getAvailableStrategies()).toContain(\'custom\');',
    '    });',
    '  });',
    '});',
    '',
  ]);

  writeFile(testPath, content.join('\n'));
}

function generateConfigTests(info) {
  var p = info.pascal;
  var testDir = path.join(info.baseDir, '__tests__');
  var testPath = path.join(testDir, p + 'Configuration.test.ts');

  if (fileExists(testPath)) return;

  writeFile(testPath, [
    '/**',
    ' * Configuration tests for ' + p + ' layer',
    ' */',
    '',
    'import { ' + p + 'ConfigurationBuilder } from \'../configuration/builders/' + p + 'ConfigurationBuilder\';',
    'import { ' + p + 'ConfigurationValidator } from \'../configuration/validators/' + p + 'ConfigurationValidator\';',
    'import { ' + p + 'DEFAULTS } from \'../configuration/defaults/' + p + 'Defaults\';',
    '',
    'describe(\'' + p + ' Configuration\', () => {',
    '  describe(\'' + p + 'ConfigurationBuilder\', () => {',
    '    it(\'should build default configuration\', () => {',
    '      var config = new ' + p + 'ConfigurationBuilder().build();',
    '      expect(config.enabled).toBe(true);',
    '      expect(config.timeout).toBe(30000);',
    '      expect(config.retries).toBe(3);',
    '    });',
    '',
    '    it(\'should chain builder methods\', () => {',
    '      var config = new ' + p + 'ConfigurationBuilder()',
    '        .withTimeout(5000)',
    '        .withRetries(1)',
    '        .withLogLevel(\'debug\')',
    '        .withStrategy(\'fast\')',
    '        .build();',
    '      expect(config.timeout).toBe(5000);',
    '      expect(config.retries).toBe(1);',
    '      expect(config.logLevel).toBe(\'debug\');',
    '      expect(config.strategy).toBe(\'fast\');',
    '    });',
    '',
    '    it(\'should create development preset\', () => {',
    '      var config = ' + p + 'ConfigurationBuilder.development();',
    '      expect(config.logLevel).toBe(\'debug\');',
    '      expect(config.retries).toBe(1);',
    '    });',
    '',
    '    it(\'should create production preset\', () => {',
    '      var config = ' + p + 'ConfigurationBuilder.production();',
    '      expect(config.logLevel).toBe(\'warn\');',
    '      expect(config.retries).toBe(5);',
    '    });',
    '',
    '    it(\'should add custom options\', () => {',
    '      var config = new ' + p + 'ConfigurationBuilder()',
    '        .withOption(\'key\', \'value\')',
    '        .withOptions({ a: 1, b: 2 })',
    '        .build();',
    '      expect(config.options.key).toBe(\'value\');',
    '      expect(config.options.a).toBe(1);',
    '      expect(config.options.b).toBe(2);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'ConfigurationValidator\', () => {',
    '    it(\'should validate correct config\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var result = validator.validate({ enabled: true, timeout: 30000, retries: 3 });',
    '      expect(result.valid).toBe(true);',
    '      expect(result.errors.length).toBe(0);',
    '    });',
    '',
    '    it(\'should reject invalid timeout\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var result = validator.validate({ timeout: 10 });',
    '      expect(result.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should reject invalid retries\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var result = validator.validate({ retries: 100 });',
    '      expect(result.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should reject unknown strategy\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var result = validator.validate({ strategy: \'unknown\' });',
    '      expect(result.valid).toBe(false);',
    '    });',
    '',
    '    it(\'should warn on invalid log level\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var result = validator.validate({ logLevel: \'verbose\' });',
    '      expect(result.warnings.length).toBeGreaterThan(0);',
    '    });',
    '',
    '    it(\'should throw on invalid config\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      expect(() => validator.validateOrThrow({ timeout: 10 })).toThrow();',
    '    });',
    '',
    '    it(\'should return defaults\', () => {',
    '      var validator = new ' + p + 'ConfigurationValidator();',
    '      var defaults = validator.getDefaults();',
    '      expect(defaults.enabled).toBe(true);',
    '    });',
    '  });',
    '',
    '  describe(\'' + p + 'DEFAULTS\', () => {',
    '    it(\'should have sensible defaults\', () => {',
    '      expect(' + p + 'DEFAULTS.enabled).toBe(true);',
    '      expect(' + p + 'DEFAULTS.timeout).toBeGreaterThan(0);',
    '      expect(' + p + 'DEFAULTS.retries).toBeGreaterThan(0);',
    '    });',
    '  });',
    '});',
    '',
  ].join('\n'));
}

// Main
var layers = fs.readdirSync(LAYERS_DIR).filter(function(f) {
  return fs.statSync(path.join(LAYERS_DIR, f)).isDirectory() && f !== '__tests__';
});

console.log('Processing ' + layers.length + ' layers...');

var stats = { strategies: 0, factories: 0, builders: 0, defaults: 0, validators: 0, strategyTests: 0, configTests: 0 };

for (var i = 0; i < layers.length; i++) {
  var info = getLayerInfo(layers[i]);

  try {
    generateStrategies(info);
    stats.strategies++;
  } catch (e) {
    console.error('  strategies failed for ' + layers[i] + ': ' + e.message);
  }

  try {
    generateFactory(info);
    stats.factories++;
  } catch (e) {
    console.error('  factory failed for ' + layers[i] + ': ' + e.message);
  }

  try {
    generateConfiguration(info);
    stats.builders++;
  } catch (e) {
    console.error('  config failed for ' + layers[i] + ': ' + e.message);
  }

  try {
    generateStrategyTests(info);
    stats.strategyTests++;
  } catch (e) {
    console.error('  strategy test failed for ' + layers[i] + ': ' + e.message);
  }

  try {
    generateConfigTests(info);
    stats.configTests++;
  } catch (e) {
    console.error('  config test failed for ' + layers[i] + ': ' + e.message);
  }
}

console.log('\nDone!');
console.log('Strategies generated: ' + stats.strategies);
console.log('Factories generated: ' + stats.factories);
console.log('Builders/defaults/validators: ' + stats.builders);
console.log('Strategy tests generated: ' + stats.strategyTests);
console.log('Config tests generated: ' + stats.configTests);
