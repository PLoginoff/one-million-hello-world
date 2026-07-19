/**
 * Controller Strategies Unit Tests
 *
 * Tests for DefaultControllerStrategy, LoggingControllerStrategy, MetricsControllerStrategy.
 */

import { DefaultControllerStrategy } from '../strategies/strategy/DefaultControllerStrategy';
import { LoggingControllerStrategy, ILogger } from '../strategies/strategy/LoggingControllerStrategy';
import { MetricsControllerStrategy } from '../strategies/strategy/MetricsControllerStrategy';
import { TransientStrategy } from '../strategies/strategy/TransientStrategy';
import { ControllerEntity } from '../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../domain/value-objects/ControllerScopeValueObject';

describe('DefaultControllerStrategy', () => {
  let strategy: DefaultControllerStrategy;
  let controller: ControllerEntity;
  let scope: ControllerScopeValueObject;

  beforeEach(() => {
    strategy = new DefaultControllerStrategy();
    controller = ControllerEntity.createBasic('ctrl-1', 'TestController', '/api/test');
    scope = ControllerScopeValueObject.transient();
  });

  it('should return name DEFAULT', () => {
    expect(strategy.getName()).toBe('DEFAULT');
  });

  it('should resolve enabled controller', () => {
    const instance = strategy.resolve(controller, scope);
    expect(instance).toBeDefined();
  });

  it('should throw for disabled controller', () => {
    const disabled = controller.disable();
    expect(() => strategy.resolve(disabled, scope)).toThrow("Controller 'ctrl-1' is disabled");
  });
});

describe('LoggingControllerStrategy', () => {
  let inner: TransientStrategy;
  let logger: ILogger;
  let logCalls: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;
  let strategy: LoggingControllerStrategy;
  let controller: ControllerEntity;
  let scope: ControllerScopeValueObject;

  beforeEach(() => {
    inner = new TransientStrategy();
    logCalls = [];
    logger = {
      info: (message: string, meta?: Record<string, unknown>) => logCalls.push({ level: 'info', message, meta }),
      warn: (message: string, meta?: Record<string, unknown>) => logCalls.push({ level: 'warn', message, meta }),
      error: (message: string, meta?: Record<string, unknown>) => logCalls.push({ level: 'error', message, meta }),
    };
    strategy = new LoggingControllerStrategy(inner, logger);
    controller = ControllerEntity.createBasic('ctrl-1', 'TestController', '/api/test');
    scope = ControllerScopeValueObject.transient();
  });

  it('should wrap inner strategy name', () => {
    expect(strategy.getName()).toBe('LOGGING(TRANSIENT)');
  });

  it('should log on successful resolution', () => {
    strategy.resolve(controller, scope);
    expect(logCalls.length).toBeGreaterThanOrEqual(2);
    expect(logCalls[0].level).toBe('info');
    expect(logCalls[0].message).toContain('resolving controller');
    expect(logCalls[1].level).toBe('info');
    expect(logCalls[1].message).toContain('controller resolved');
  });

  it('should log error on failed resolution', () => {
    const failingInner: typeof inner = {
      getName: () => 'FAILING',
      resolve: () => {
        throw new Error('boom');
      },
    } as unknown as typeof inner;
    const failingStrategy = new LoggingControllerStrategy(failingInner, logger);

    expect(() => failingStrategy.resolve(controller, scope)).toThrow('boom');
    const errorLog = logCalls.find((c) => c.level === 'error');
    expect(errorLog).toBeDefined();
    expect(errorLog!.message).toContain('resolution failed');
  });
});

describe('MetricsControllerStrategy', () => {
  let inner: TransientStrategy;
  let strategy: MetricsControllerStrategy;
  let controller: ControllerEntity;
  let scope: ControllerScopeValueObject;

  beforeEach(() => {
    inner = new TransientStrategy();
    strategy = new MetricsControllerStrategy(inner);
    controller = ControllerEntity.createBasic('ctrl-1', 'TestController', '/api/test');
    scope = ControllerScopeValueObject.transient();
  });

  it('should wrap inner strategy name', () => {
    expect(strategy.getName()).toBe('METRICS(TRANSIENT)');
  });

  it('should track successful resolutions', () => {
    strategy.resolve(controller, scope);
    strategy.resolve(controller, scope);

    const metrics = strategy.getMetrics();
    expect(metrics.totalResolutions).toBe(2);
    expect(metrics.successfulResolutions).toBe(2);
    expect(metrics.failedResolutions).toBe(0);
  });

  it('should track failed resolutions', () => {
    const failingInner: typeof inner = {
      getName: () => 'FAILING',
      resolve: () => {
        throw new Error('fail');
      },
    } as unknown as typeof inner;
    const failingStrategy = new MetricsControllerStrategy(failingInner);

    expect(() => failingStrategy.resolve(controller, scope)).toThrow('fail');

    const metrics = failingStrategy.getMetrics();
    expect(metrics.totalResolutions).toBe(1);
    expect(metrics.failedResolutions).toBe(1);
    expect(metrics.successfulResolutions).toBe(0);
  });

  it('should track per-controller metrics', () => {
    strategy.resolve(controller, scope);
    strategy.resolve(controller, scope);

    const metrics = strategy.getMetrics();
    expect(metrics.perController.length).toBe(1);
    expect(metrics.perController[0].controllerId).toBe('ctrl-1');
    expect(metrics.perController[0].count).toBe(2);
  });

  it('should reset metrics', () => {
    strategy.resolve(controller, scope);
    strategy.reset();

    const metrics = strategy.getMetrics();
    expect(metrics.totalResolutions).toBe(0);
    expect(metrics.perController.length).toBe(0);
  });

  it('should compute average resolution time', () => {
    strategy.resolve(controller, scope);
    strategy.resolve(controller, scope);

    const metrics = strategy.getMetrics();
    expect(metrics.averageResolutionTimeMs).toBeGreaterThanOrEqual(0);
  });
});
