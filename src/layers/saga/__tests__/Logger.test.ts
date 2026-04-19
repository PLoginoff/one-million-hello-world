/**
 * Logger Unit Tests
 * 
 * Tests for Logger implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Logger } from '../implementations/Logger';
import { LogLevel } from '../interfaces/ILogger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(logger.getLogLevel()).toBe(LogLevel.INFO);
      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      expect(logger.isEnabled()).toBe(false);
    });

    it('should return true after enabling', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
    });

    it('should return false after disabling', () => {
      logger.setEnabled(true);
      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('should enable logging', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
    });

    it('should disable logging', () => {
      logger.setEnabled(true);
      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe('getLogLevel', () => {
    it('should return INFO by default', () => {
      expect(logger.getLogLevel()).toBe(LogLevel.INFO);
    });

    it('should return set log level', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      expect(logger.getLogLevel()).toBe(LogLevel.DEBUG);
    });
  });

  describe('setLogLevel', () => {
    it('should set log level to DEBUG', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      expect(logger.getLogLevel()).toBe(LogLevel.DEBUG);
    });

    it('should set log level to INFO', () => {
      logger.setLogLevel(LogLevel.INFO);
      expect(logger.getLogLevel()).toBe(LogLevel.INFO);
    });

    it('should set log level to WARN', () => {
      logger.setLogLevel(LogLevel.WARN);
      expect(logger.getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should set log level to ERROR', () => {
      logger.setLogLevel(LogLevel.ERROR);
      expect(logger.getLogLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('debug', () => {
    it('should not log when disabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.debug('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log when enabled and level allows', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should not log when level is higher than DEBUG', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log with context', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('info', () => {
    it('should not log when disabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log when enabled and level allows', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.INFO);
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should not log when level is higher than INFO', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.WARN);
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log with context', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.info('test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('warn', () => {
    it('should not log when disabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.warn('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log when enabled and level allows', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.WARN);
      logger.warn('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should not log when level is higher than WARN', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.ERROR);
      logger.warn('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log with context', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.warn('test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('should not log when disabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.error('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log when enabled and level allows', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should log with context', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.error('test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('log level priority', () => {
    it('should allow DEBUG when set to DEBUG', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      consoleLogSpy.mockRestore();
    });

    it('should allow INFO when set to INFO', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      consoleLogSpy.mockRestore();
    });

    it('should allow WARN when set to WARN', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.WARN);
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      consoleLogSpy.mockRestore();
    });

    it('should allow ERROR when set to ERROR', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');
      logger.setEnabled(true);
      logger.setLogLevel(LogLevel.ERROR);
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      consoleLogSpy.mockRestore();
    });
  });
});
