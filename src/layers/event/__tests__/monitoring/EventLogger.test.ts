/**
 * EventLogger Unit Tests
 * 
 * Comprehensive tests for EventLogger monitoring implementation.
 * Tests cover logging levels, entry management, filtering, and edge cases.
 */

import { EventLogger, LogLevel } from '../../monitoring/EventLogger';

describe('EventLogger', () => {
  let logger: EventLogger;

  beforeEach(() => {
    logger = new EventLogger();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
      expect(logger.getEntries().length).toBe(0);
    });

    it('should create with custom level', () => {
      const customLogger = new EventLogger({ level: LogLevel.DEBUG });
      expect(customLogger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should create with console disabled', () => {
      const customLogger = new EventLogger({ enableConsole: false });
      expect(customLogger).toBeDefined();
    });

    it('should create with custom max entries', () => {
      const customLogger = new EventLogger({ maxEntries: 500 });
      expect(customLogger).toBeDefined();
    });
  });

  describe('debug', () => {
    it('should log debug message when level allows', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Debug message');
      expect(entries[0].level).toBe(LogLevel.DEBUG);
    });

    it('should not log debug when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('Debug message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should not log debug when level is WARN', () => {
      logger.setLevel(LogLevel.WARN);
      logger.debug('Debug message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should not log debug when level is ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.debug('Debug message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should include context', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug message', { key: 'value' });

      const entries = logger.getEntries();
      expect(entries[0].context).toEqual({ key: 'value' });
    });

    it('should include timestamp', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug message');

      const entries = logger.getEntries();
      expect(entries[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('info', () => {
    it('should log info message when level allows', () => {
      logger.info('Info message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Info message');
      expect(entries[0].level).toBe(LogLevel.INFO);
    });

    it('should not log info when level is WARN', () => {
      logger.setLevel(LogLevel.WARN);
      logger.info('Info message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should not log info when level is ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.info('Info message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should log info when level is DEBUG', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.info('Info message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
    });

    it('should include context', () => {
      logger.info('Info message', { key: 'value' });

      const entries = logger.getEntries();
      expect(entries[0].context).toEqual({ key: 'value' });
    });
  });

  describe('warn', () => {
    it('should log warn message when level allows', () => {
      logger.warn('Warn message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Warn message');
      expect(entries[0].level).toBe(LogLevel.WARN);
    });

    it('should not log warn when level is ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.warn('Warn message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should log warn when level is DEBUG', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.warn('Warn message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
    });

    it('should log warn when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.warn('Warn message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
    });

    it('should include context', () => {
      logger.warn('Warn message', { key: 'value' });

      const entries = logger.getEntries();
      expect(entries[0].context).toEqual({ key: 'value' });
    });
  });

  describe('error', () => {
    it('should log error message when level allows', () => {
      logger.error('Error message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Error message');
      expect(entries[0].level).toBe(LogLevel.ERROR);
    });

    it('should log error regardless of level', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.error('Error message');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
    });

    it('should include context', () => {
      logger.error('Error message', { key: 'value' });

      const entries = logger.getEntries();
      expect(entries[0].context).toEqual({ key: 'value' });
    });
  });

  describe('getEntries', () => {
    it('should return all entries', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(4);
    });

    it('should return empty array when no entries', () => {
      const entries = logger.getEntries();
      expect(entries).toEqual([]);
    });

    it('should return copy of entries', () => {
      logger.info('Test');
      const entries = logger.getEntries();
      entries.push({} as any);

      const freshEntries = logger.getEntries();
      expect(freshEntries).toHaveLength(1);
    });

    it('should filter by level', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      const debugEntries = logger.getEntries(LogLevel.DEBUG);
      expect(debugEntries).toHaveLength(1);

      const infoEntries = logger.getEntries(LogLevel.INFO);
      expect(infoEntries).toHaveLength(1);

      const warnEntries = logger.getEntries(LogLevel.WARN);
      expect(warnEntries).toHaveLength(1);

      const errorEntries = logger.getEntries(LogLevel.ERROR);
      expect(errorEntries).toHaveLength(1);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const entries = logger.getEntries(LogLevel.INFO, 5);
      expect(entries).toHaveLength(5);
    });

    it('should return most recent entries when limited', () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const entries = logger.getEntries(LogLevel.INFO, 3);
      expect(entries[0].message).toBe('Message 7');
      expect(entries[1].message).toBe('Message 8');
      expect(entries[2].message).toBe('Message 9');
    });
  });

  describe('getRecentEntries', () => {
    it('should return recent entries', () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const recent = logger.getRecentEntries(5);
      expect(recent).toHaveLength(5);
    });

    it('should return most recent entries', () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const recent = logger.getRecentEntries(3);
      expect(recent[0].message).toBe('Message 7');
      expect(recent[1].message).toBe('Message 8');
      expect(recent[2].message).toBe('Message 9');
    });

    it('should return copy of entries', () => {
      logger.info('Test');
      const recent = logger.getRecentEntries(1);
      recent.push({} as any);

      const freshRecent = logger.getRecentEntries(1);
      expect(freshRecent).toHaveLength(1);
    });

    it('should handle count larger than entry count', () => {
      logger.info('Test');
      const recent = logger.getRecentEntries(10);
      expect(recent).toHaveLength(1);
    });

    it('should return empty array when no entries', () => {
      const recent = logger.getRecentEntries(5);
      expect(recent).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');

      logger.clear();

      const entries = logger.getEntries();
      expect(entries).toEqual([]);
    });

    it('should handle clearing empty logger', () => {
      expect(() => logger.clear()).not.toThrow();
      const entries = logger.getEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should accept all valid levels', () => {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

      for (const level of levels) {
        logger.setLevel(level);
        expect(logger.getLevel()).toBe(level);
      }
    });
  });

  describe('getLevel', () => {
    it('should return current level', () => {
      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('max entries limit', () => {
    it('should enforce max entries limit', () => {
      const customLogger = new EventLogger({ maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        customLogger.info(`Message ${i}`);
      }

      const entries = customLogger.getEntries();
      expect(entries.length).toBeLessThanOrEqual(5);
    });

    it('should remove oldest entries when limit reached', () => {
      const customLogger = new EventLogger({ maxEntries: 3 });

      customLogger.info('Message 1');
      customLogger.info('Message 2');
      customLogger.info('Message 3');
      customLogger.info('Message 4');

      const entries = customLogger.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe('Message 2');
      expect(entries[1].message).toBe('Message 3');
      expect(entries[2].message).toBe('Message 4');
    });
  });

  describe('console output', () => {
    it('should output to console by default', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not output to console when disabled', () => {
      const customLogger = new EventLogger({ enableConsole: false });
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      customLogger.info('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use correct console method for level', () => {
      logger.setLevel(LogLevel.DEBUG);
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle logging many messages', () => {
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`);
      }

      const entries = logger.getEntries();
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should handle empty message', () => {
      logger.info('');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('');
    });

    it('should handle very long message', () => {
      const longMessage = 'a'.repeat(10000);
      logger.info(longMessage);

      const entries = logger.getEntries();
      expect(entries[0].message).toBe(longMessage);
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'test\n\t\r';
      logger.info(specialMessage);

      const entries = logger.getEntries();
      expect(entries[0].message).toBe(specialMessage);
    });

    it('should handle unicode characters in message', () => {
      const unicodeMessage = 'тест';
      logger.info(unicodeMessage);

      const entries = logger.getEntries();
      expect(entries[0].message).toBe(unicodeMessage);
    });

    it('should handle complex context object', () => {
      const complexContext = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      logger.info('Test', complexContext);

      const entries = logger.getEntries();
      expect(entries[0].context).toEqual(complexContext);
    });

    it('should handle null context', () => {
      logger.info('Test', null);

      const entries = logger.getEntries();
      expect(entries[0].context).toBe(null);
    });

    it('should handle undefined context', () => {
      logger.info('Test', undefined);

      const entries = logger.getEntries();
      expect(entries[0].context).toBeUndefined();
    });

    it('should handle concurrent logging', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              logger.info(`Message ${i}`);
              resolve(null);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      const entries = logger.getEntries();
      expect(entries.length).toBe(100);
    });
  });
});
