/**
 * Pattern tests for Repository
 */

import { RepositoryAccessPolicy } from '../policies/RepositoryAccessPolicy';
import { RepositoryRatePolicy } from '../policies/RepositoryRatePolicy';
import { RepositoryAndSpecification } from '../specifications/RepositoryAndSpecification';
import { RepositoryOrSpecification } from '../specifications/RepositoryOrSpecification';
import { RepositoryNotSpecification } from '../specifications/RepositoryNotSpecification';
import { RepositoryEventObserver } from '../observers/RepositoryEventObserver';
import { RepositoryProcessingPipeline } from '../pipelines/RepositoryProcessingPipeline';
import { RepositoryLoggingDecorator, IRepositoryComponent } from '../decorators/RepositoryLoggingDecorator';
import { RepositoryCachingDecorator } from '../decorators/RepositoryCachingDecorator';
import { RepositoryEventHandler } from '../handlers/RepositoryEventHandler';

describe('Patterns: Repository', () => {
  describe('RepositoryAccessPolicy', () => {
    it('should allow with correct role', () => {
      var policy = new RepositoryAccessPolicy().allowIfRole('admin');
      expect(policy.isAllowed({ userId: 'u1', resource: 'r', action: 'a', roles: ['admin'], attributes: {} })).toBe(true);
    });

    it('should deny without role', () => {
      var policy = new RepositoryAccessPolicy().allowIfRole('admin');
      expect(policy.isDenied({ userId: 'u1', resource: 'r', action: 'a', roles: ['user'], attributes: {} })).toBe(true);
    });

    it('should support deny rules with higher priority', () => {
      var policy = new RepositoryAccessPolicy().allowIfRole('admin').denyIfRole('banned', 200);
      expect(policy.isDenied({ userId: 'u1', resource: 'r', action: 'a', roles: ['admin', 'banned'], attributes: {} })).toBe(true);
    });
  });

  describe('RepositoryRatePolicy', () => {
    it('should allow within limit', () => {
      var policy = new RepositoryRatePolicy();
      policy.configure('api', { maxRequests: 3, windowMs: 1000, key: 'api' });
      expect(policy.check('api', 'user-1').allowed).toBe(true);
    });

    it('should block over limit', () => {
      var policy = new RepositoryRatePolicy(100);
      policy.configure('api', { maxRequests: 2, windowMs: 1000, key: 'api' });
      policy.check('api', 'u'); policy.check('api', 'u');
      var result = policy.check('api', 'u');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Specifications', () => {
    var alwaysTrue: any = { isSatisfiedBy: () => true, and: function(o:any){return this;}, or: function(o:any){return this;}, not: function(){return this;} };
    var alwaysFalse: any = { isSatisfiedBy: () => false, and: function(o:any){return this;}, or: function(o:any){return this;}, not: function(){return this;} };

    it('And should require all true', () => {
      var spec = new RepositoryAndSpecification([alwaysTrue, alwaysTrue]);
      expect(spec.isSatisfiedBy({})).toBe(true);
    });

    it('And should fail if any false', () => {
      var spec = new RepositoryAndSpecification([alwaysTrue, alwaysFalse]);
      expect(spec.isSatisfiedBy({})).toBe(false);
    });

    it('Or should pass if any true', () => {
      var spec = new RepositoryOrSpecification([alwaysFalse, alwaysTrue]);
      expect(spec.isSatisfiedBy({})).toBe(true);
    });

    it('Not should invert', () => {
      var spec = new RepositoryNotSpecification(alwaysFalse);
      expect(spec.isSatisfiedBy({})).toBe(true);
    });
  });

  describe('RepositoryEventObserver', () => {
    it('should notify subscribers', () => {
      var obs = new RepositoryEventObserver();
      var received: string[] = [];
      obs.subscribe('test', { onEvent: (type, payload) => received.push(type + ':' + String(payload)) });
      obs.emit('test', 'hello');
      expect(received).toContain('test:hello');
    });

    it('should handle once subscriptions', () => {
      var obs = new RepositoryEventObserver();
      var count = 0;
      obs.subscribeOnce('evt', { onEvent: () => count++ });
      obs.emit('evt', 1); obs.emit('evt', 2);
      expect(count).toBe(1);
    });

    it('should log events', () => {
      var obs = new RepositoryEventObserver();
      obs.emit('a', 1); obs.emit('b', 2);
      expect(obs.getEventLog().length).toBe(2);
    });
  });

  describe('RepositoryProcessingPipeline', () => {
    it('should execute stages in order', async () => {
      var pipe = new RepositoryProcessingPipeline();
      var order: string[] = [];
      pipe.addStage('one', async (ctx) => order.push('one'));
      pipe.addStage('two', async (ctx) => order.push('two'));
      await pipe.execute('test');
      expect(order).toEqual(['one', 'two']);
    });

    it('should stop on error without handler', async () => {
      var pipe = new RepositoryProcessingPipeline();
      pipe.addStage('fail', async () => { throw new Error('boom'); });
      pipe.addStage('after', async () => {});
      var ctx = await pipe.execute('test');
      expect(ctx.error).toBe('boom');
    });

    it('should continue if error handler returns true', async () => {
      var pipe = new RepositoryProcessingPipeline();
      pipe.addStage('fail', async () => { throw new Error('boom'); }, async () => true);
      pipe.addStage('after', async (ctx) => { ctx.output = 'done'; });
      var ctx = await pipe.execute('test');
      expect(ctx.output).toBe('done');
    });
  });

  describe('Decorators', () => {
    var mockComponent: IRepositoryComponent = {
      getName: () => 'mock',
      execute: async (input) => ({ success: true, data: input }),
    };

    it('LoggingDecorator should log execution', async () => {
      var dec = new RepositoryLoggingDecorator(mockComponent);
      await dec.execute('test');
      expect(dec.getLogs().length).toBeGreaterThan(0);
    });

    it('CachingDecorator should cache results', async () => {
      var dec = new RepositoryCachingDecorator(mockComponent);
      await dec.execute('test');
      await dec.execute('test');
      expect(dec.getHits()).toBe(1);
      expect(dec.getMisses()).toBe(1);
    });
  });

  describe('RepositoryEventHandler', () => {
    it('should dispatch to handlers', async () => {
      var handler = new RepositoryEventHandler();
      var received: string[] = [];
      handler.on('test', async (e) => received.push(e.type));
      await handler.dispatch({ type: 'test', payload: {}, timestamp: Date.now(), source: 'unit' });
      expect(received).toContain('test');
    });

    it('should call global handlers', async () => {
      var handler = new RepositoryEventHandler();
      var count = 0;
      handler.onAny(async () => count++);
      await handler.dispatch({ type: 'a', payload: {}, timestamp: 0, source: '' });
      await handler.dispatch({ type: 'b', payload: {}, timestamp: 0, source: '' });
      expect(count).toBe(2);
    });
  });
});
