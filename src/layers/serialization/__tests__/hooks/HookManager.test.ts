/**
 * Hook Manager Unit Tests
 */

import { HookManager } from '../../hooks/HookManager';
import { HookType, HookContext } from '../../hooks/SerializationHook';

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  describe('registerHook', () => {
    it('should register hook', () => {
      const hook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'test-hook',
      };

      manager.registerHook(hook);
      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);

      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toEqual(hook);
    });

    it('should register hooks with priority', () => {
      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook1',
        priority: 10,
      };

      const hook2 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook2',
        priority: 5,
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);
      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);

      expect(hooks[0].name).toBe('hook2');
      expect(hooks[1].name).toBe('hook1');
    });

    it('should register hooks with same priority in registration order', () => {
      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook1',
        priority: 5,
      };

      const hook2 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook2',
        priority: 5,
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);
      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);

      expect(hooks[0].name).toBe('hook1');
      expect(hooks[1].name).toBe('hook2');
    });
  });

  describe('unregisterHook', () => {
    it('should unregister hook by type and name', () => {
      const hook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'test-hook',
      };

      manager.registerHook(hook);
      manager.unregisterHook(HookType.BEFORE_SERIALIZE, 'test-hook');

      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);
      expect(hooks).toHaveLength(0);
    });

    it('should handle unregistering non-existent hook', () => {
      manager.unregisterHook(HookType.BEFORE_SERIALIZE, 'nonexistent');
      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);
      expect(hooks).toHaveLength(0);
    });
  });

  describe('executeHook', () => {
    it('should execute hooks in priority order', async () => {
      const callOrder: string[] = [];

      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data: any) => {
          callOrder.push('hook1');
          return data;
        }),
        name: 'hook1',
        priority: 10,
      };

      const hook2 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data: any) => {
          callOrder.push('hook2');
          return data;
        }),
        name: 'hook2',
        priority: 5,
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);

      const data = { message: 'Hello' };
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };
      await manager.executeHook(HookType.BEFORE_SERIALIZE, data, context);

      expect(callOrder).toEqual(['hook2', 'hook1']);
    });

    it('should pass data through all hooks', async () => {
      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data: any) => ({ ...data, modified: true })),
        name: 'hook1',
      };

      const hook2 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data: any) => ({ ...data, modified2: true })),
        name: 'hook2',
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);

      const data: any = { message: 'Hello' };
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };
      const result = await manager.executeHook(HookType.BEFORE_SERIALIZE, data, context);

      expect(result.modified).toBe(true);
      expect(result.modified2).toBe(true);
    });

    it('should pass context to hooks', async () => {
      const hook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data: any, ctx: HookContext) => {
          expect(ctx.format).toBe('json');
          return data;
        }),
        name: 'test-hook',
      };

      manager.registerHook(hook);

      const data = { message: 'Hello' };
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };
      await manager.executeHook(HookType.BEFORE_SERIALIZE, data, context);

      expect(hook.fn).toHaveBeenCalledWith(data, context);
    });

    it('should handle no hooks', async () => {
      const data = { message: 'Hello' };
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };
      const result = await manager.executeHook(HookType.BEFORE_SERIALIZE, data, context);

      expect(result).toEqual(data);
    });
  });


  describe('executeErrorHooks', () => {
    it('should execute all error hooks', async () => {
      const errorHook = {
        type: HookType.ON_ERROR,
        fn: jest.fn((error: Error, ctx: HookContext) => {}),
        name: 'error-hook',
      };

      manager.registerHook(errorHook);

      const error = new Error('Test error');
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };
      await manager.executeErrorHooks(error, context);

      expect(errorHook.fn).toHaveBeenCalledWith(error, context);
    });

    it('should handle no error hooks', async () => {
      const error = new Error('Test error');
      const context: HookContext = { format: 'json', operation: 'serialize', timestamp: new Date() };

      await expect(manager.executeErrorHooks(error, context)).resolves.not.toThrow();
    });
  });

  describe('getHooks', () => {
    it('should return hooks by type', () => {
      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook1',
      };

      const hook2 = {
        type: HookType.AFTER_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook2',
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);

      const beforeHooks = manager.getHooks(HookType.BEFORE_SERIALIZE);
      const afterHooks = manager.getHooks(HookType.AFTER_SERIALIZE);

      expect(beforeHooks).toHaveLength(1);
      expect(afterHooks).toHaveLength(1);
    });

    it('should return empty array for type with no hooks', () => {
      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);
      expect(hooks).toHaveLength(0);
    });
  });

  describe('clearHooks', () => {
    it('should clear all hooks for a type', () => {
      const hook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'test-hook',
      };

      manager.registerHook(hook);
      manager.clearType(HookType.BEFORE_SERIALIZE);

      const hooks = manager.getHooks(HookType.BEFORE_SERIALIZE);
      expect(hooks).toHaveLength(0);
    });

    it('should clear all hooks', () => {
      const hook1 = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook1',
      };

      const hook2 = {
        type: HookType.AFTER_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'hook2',
      };

      manager.registerHook(hook1);
      manager.registerHook(hook2);
      manager.clear();

      expect(manager.getHooks(HookType.BEFORE_SERIALIZE)).toHaveLength(0);
      expect(manager.getHooks(HookType.AFTER_SERIALIZE)).toHaveLength(0);
    });
  });
});
