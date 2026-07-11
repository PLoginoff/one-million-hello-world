/**
 * Logger Tests
 */

import { ConsoleLogger, MemoryLogger, LoggerFactory, LogLevel } from '../../logging';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    consoleSpies = [
      jest.spyOn(console, 'debug').mockImplementation(),
      jest.spyOn(console, 'info').mockImplementation(),
      jest.spyOn(console, 'warn').mockImplementation(),
      jest.spyOn(console, 'error').mockImplementation(),
    ];
    logger = new ConsoleLogger('test', LogLevel.DEBUG);
  });

  afterEach(() => {
    consoleSpies.forEach(spy => spy.mockRestore());
  });

  const anyConsoleCalled = () => consoleSpies.some(spy => spy.mock.calls.length > 0);

  it('should log debug message', () => {
    logger.debug('debug message');
    expect(anyConsoleCalled()).toBe(true);
  });

  it('should log info message', () => {
    logger.info('info message');
    expect(anyConsoleCalled()).toBe(true);
  });

  it('should log warning message', () => {
    logger.warn('warning message');
    expect(anyConsoleCalled()).toBe(true);
  });

  it('should log error message', () => {
    logger.error('error message');
    expect(anyConsoleCalled()).toBe(true);
  });

  it('should respect log level', () => {
    logger.setLevel(LogLevel.ERROR);
    logger.debug('debug message');
    expect(anyConsoleCalled()).toBe(false);
    logger.error('error message');
    expect(anyConsoleCalled()).toBe(true);
  });
});

describe('MemoryLogger', () => {
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger('test', LogLevel.DEBUG);
  });

  it('should store log entries', () => {
    logger.debug('debug message');
    logger.info('info message');
    expect(logger.getEntries()).toHaveLength(2);
  });

  it('should filter entries by level', () => {
    logger.debug('debug message');
    logger.info('info message');
    logger.error('error message');
    const errorEntries = logger.getEntriesByLevel(LogLevel.ERROR);
    expect(errorEntries).toHaveLength(1);
  });

  it('should clear entries', () => {
    logger.debug('debug message');
    logger.clear();
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('should respect max entries', () => {
    logger.setMaxEntries(5);
    for (let i = 0; i < 10; i++) {
      logger.debug(`message ${i}`);
    }
    expect(logger.size()).toBe(5);
  });
});

describe('LoggerFactory', () => {
  it('should create console logger', () => {
    const logger = LoggerFactory.createConsole('test');
    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should create memory logger', () => {
    const logger = LoggerFactory.createMemory('test');
    expect(logger).toBeInstanceOf(MemoryLogger);
  });

  it('should set default level', () => {
    LoggerFactory.setDefaultLevel(LogLevel.WARN);
    const logger = LoggerFactory.create('test');
    expect(logger.getLevel()).toBe(LogLevel.WARN);
  });
});
