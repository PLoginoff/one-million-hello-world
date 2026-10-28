/**
 * Security Logging Strategy Tests
 */

import { SecurityDefaultStrategy, ISecurityStrategy } from '../strategies/DefaultStrategy';
import { SecurityLoggingStrategy, SecurityLoggingStrategyOptions, SecurityLogger, SecurityLoggingStrategyFactory } from '../strategies/LoggingStrategy';

describe('SecurityLoggingStrategy', () => {
  let mockLogger: SecurityLogger;
  let mockStrategy: ISecurityStrategy;
  let loggedMessages: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;

  beforeEach(() => {
    loggedMessages = [];
    mockLogger = {
      debug: (msg, meta) => loggedMessages.push({ level: 'debug', message: msg, meta }),
      info: (msg, meta) => loggedMessages.push({ level: 'info', message: msg, meta }),
      warn: (msg, meta) => loggedMessages.push({ level: 'warn', message: msg, meta }),
      error: (msg, meta) => loggedMessages.push({ level: 'error', message: msg, meta }),
    };

    mockStrategy = new SecurityDefaultStrategy();
  });

  describe('Construction', () => {
    it('should create logging strategy with default options', () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy);
      expect(strategy.name).toBe('logging');
      expect(strategy.priority).toBe(5);
      expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
    });

    it('should create logging strategy with custom options', () => {
      const options: Partial<SecurityLoggingStrategyOptions> = {
        logLevel: 'debug',
        logRequests: false,
        logResponses: false,
        logErrors: false,
        includeMetadata: false,
        logger: mockLogger,
      };
      const strategy = new SecurityLoggingStrategy(mockStrategy, options);
      expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
    });

    it('should use default console logger when none provided', () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy);
      expect(strategy).toBeDefined();
    });
  });

  describe('canHandle', () => {
    it('should delegate to wrapped strategy', () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy);
      expect(strategy.canHandle({ test: 'data' })).toBe(true);
      expect(strategy.canHandle(null)).toBe(false);
      expect(strategy.canHandle(undefined)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should log request and response on success', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, { logger: mockLogger });
      const input = { test: 'data' };

      const result = await strategy.execute(input);

      expect(result.success).toBe(true);
      expect(loggedMessages.length).toBe(2);
      expect(loggedMessages[0].level).toBe('info');
      expect(loggedMessages[0].message).toBe('Security request received');
      expect(loggedMessages[1].level).toBe('info');
      expect(loggedMessages[1].message).toBe('Security request completed');
    });

    it('should log error on failure', async () => {
      const failingStrategy: ISecurityStrategy = {
        name: 'failing',
        priority: 0,
        canHandle: () => true,
        execute: async () => {
          throw new Error('Strategy failed');
        },
      };

      const strategy = new SecurityLoggingStrategy(failingStrategy, { logger: mockLogger });

      await expect(strategy.execute({ test: 'data' })).rejects.toThrow();

      expect(loggedMessages.length).toBe(2);
      expect(loggedMessages[0].message).toBe('Security request received');
      expect(loggedMessages[1].level).toBe('error');
      expect(loggedMessages[1].message).toBe('Security request error');
    });

    it('should not log requests when disabled', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, {
        logger: mockLogger,
        logRequests: false,
      });

      await strategy.execute({ test: 'data' });

      expect(loggedMessages.length).toBe(1);
      expect(loggedMessages[0].message).toBe('Security request completed');
    });

    it('should not log responses when disabled', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, {
        logger: mockLogger,
        logResponses: false,
      });

      await strategy.execute({ test: 'data' });

      expect(loggedMessages.length).toBe(1);
      expect(loggedMessages[0].message).toBe('Security request received');
    });

    it('should not log errors when disabled', async () => {
      const failingStrategy: ISecurityStrategy = {
        name: 'failing',
        priority: 0,
        canHandle: () => true,
        execute: async () => {
          throw new Error('Strategy failed');
        },
      };

      const strategy = new SecurityLoggingStrategy(failingStrategy, {
        logger: mockLogger,
        logErrors: false,
      });

      await expect(strategy.execute({ test: 'data' })).rejects.toThrow();

      expect(loggedMessages.length).toBe(1);
      expect(loggedMessages[0].message).toBe('Security request received');
    });

    it('should include metadata when enabled', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, {
        logger: mockLogger,
        includeMetadata: true,
      });

      await strategy.execute({ key: 'value', num: 42 });

      const requestLog = loggedMessages[0];
      expect(requestLog.meta?.inputType).toBe('object');
      expect(requestLog.meta?.inputKeys).toContain('key');
      expect(requestLog.meta?.inputKeys).toContain('num');
    });

    it('should not include metadata when disabled', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, {
        logger: mockLogger,
        includeMetadata: false,
      });

      await strategy.execute({ key: 'value' });

      const requestLog = loggedMessages[0];
      expect(requestLog.meta?.inputType).toBeUndefined();
      expect(requestLog.meta?.inputKeys).toBeUndefined();
    });

    it('should log warning for failed result', async () => {
      const failingResultStrategy: ISecurityStrategy = {
        name: 'failing-result',
        priority: 0,
        canHandle: () => true,
        execute: async () => ({
          success: false,
          error: { code: 'TEST_ERROR', message: 'Test error' },
        }),
      };

      const strategy = new SecurityLoggingStrategy(failingResultStrategy, { logger: mockLogger });

      const result = await strategy.execute({ test: 'data' });

      expect(result.success).toBe(false);
      expect(loggedMessages[1].level).toBe('warn');
      expect(loggedMessages[1].message).toBe('Security request failed');
      expect(loggedMessages[1].meta?.errorCode).toBe('TEST_ERROR');
    });
  });

  describe('getExecutionCount', () => {
    it('should track execution count', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy, { logger: mockLogger });

      expect(strategy.getExecutionCount()).toBe(0);
      await strategy.execute({ test: '1' });
      expect(strategy.getExecutionCount()).toBe(1);
      await strategy.execute({ test: '2' });
      expect(strategy.getExecutionCount()).toBe(2);
    });
  });

  describe('setLogger', () => {
    it('should allow changing logger', async () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy);
      const newLogger: SecurityLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      strategy.setLogger(newLogger);
      await strategy.execute({ test: 'data' });
      // Should not throw
    });
  });

  describe('setLogLevel', () => {
    it('should allow changing log level', () => {
      const strategy = new SecurityLoggingStrategy(mockStrategy);
      strategy.setLogLevel('debug');
      strategy.setLogLevel('warn');
      strategy.setLogLevel('error');
    });
  });
});

describe('SecurityLoggingStrategyFactory', () => {
  let mockStrategy: ISecurityStrategy;

  beforeEach(() => {
    mockStrategy = new SecurityDefaultStrategy();
  });

  it('should create logging strategy', () => {
    const strategy = SecurityLoggingStrategyFactory.create(mockStrategy);
    expect(strategy).toBeInstanceOf(SecurityLoggingStrategy);
    expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
  });

  it('should create logging strategy with options', () => {
    const strategy = SecurityLoggingStrategyFactory.create(mockStrategy, { logLevel: 'debug' });
    expect(strategy).toBeInstanceOf(SecurityLoggingStrategy);
  });

  it('should create with default logger', () => {
    const strategy = SecurityLoggingStrategyFactory.createWithDefaultLogger(mockStrategy, 'debug');
    expect(strategy).toBeInstanceOf(SecurityLoggingStrategy);
  });
});