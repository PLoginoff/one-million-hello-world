/**
 * Middleware Pipeline Tests
 */

import { MiddlewarePipeline, IMiddleware, MiddlewareContext } from '../../middleware';

class TestMiddleware implements IMiddleware {
  constructor(private _name: string, private _transform: (ctx: MiddlewareContext) => MiddlewareContext = ctx => ctx) {}

  process(context: MiddlewareContext, next: (ctx: MiddlewareContext) => MiddlewareContext): MiddlewareContext {
    context = this._transform(context);
    return next(context);
  }

  getName(): string {
    return this._name;
  }
}

describe('MiddlewarePipeline', () => {
  let pipeline: MiddlewarePipeline;

  beforeEach(() => {
    pipeline = new MiddlewarePipeline();
  });

  describe('Middleware Management', () => {
    it('should add middleware', () => {
      const middleware = new TestMiddleware('test');
      pipeline.use(middleware);
      expect(pipeline.getMiddlewares()).toHaveLength(1);
    });

    it('should add multiple middlewares', () => {
      const m1 = new TestMiddleware('m1');
      const m2 = new TestMiddleware('m2');
      pipeline.useMultiple([m1, m2]);
      expect(pipeline.getMiddlewares()).toHaveLength(2);
    });

    it('should remove middleware', () => {
      const middleware = new TestMiddleware('test');
      pipeline.use(middleware);
      pipeline.remove(middleware);
      expect(pipeline.getMiddlewares()).toHaveLength(0);
    });

    it('should remove middleware by name', () => {
      const middleware = new TestMiddleware('test');
      pipeline.use(middleware);
      pipeline.removeByName('test');
      expect(pipeline.getMiddlewares()).toHaveLength(0);
    });

    it('should clear all middlewares', () => {
      pipeline.use(new TestMiddleware('m1'));
      pipeline.use(new TestMiddleware('m2'));
      pipeline.clear();
      expect(pipeline.getMiddlewares()).toHaveLength(0);
    });
  });

  describe('Processing', () => {
    it('should process through all middlewares', () => {
      const context: MiddlewareContext = { data: 'test', operation: 'serialize' };
      pipeline.use(new TestMiddleware('m1', ctx => { ctx.data = ctx.data + '1'; return ctx; }));
      pipeline.use(new TestMiddleware('m2', ctx => { ctx.data = ctx.data + '2'; return ctx; }));
      const result = pipeline.processSync(context);
      expect(result.data).toBe('test12');
    });

    it('should process asynchronously', async () => {
      const context: MiddlewareContext = { data: 'test', operation: 'serialize' };
      pipeline.use(new TestMiddleware('m1'));
      pipeline.use(new TestMiddleware('m2'));
      const result = await pipeline.process(context);
      expect(result).toBeDefined();
    });
  });

  describe('Insertion', () => {
    it('should insert middleware at position', () => {
      const m1 = new TestMiddleware('m1');
      const m2 = new TestMiddleware('m2');
      pipeline.use(m1);
      pipeline.insertAt(0, m2);
      expect(pipeline.getMiddlewares()[0]).toBe(m2);
    });

    it('should insert before middleware', () => {
      const m1 = new TestMiddleware('m1');
      const m2 = new TestMiddleware('m2');
      pipeline.use(m1);
      pipeline.insertBefore('m1', m2);
      expect(pipeline.getMiddlewares()[0]).toBe(m2);
    });

    it('should insert after middleware', () => {
      const m1 = new TestMiddleware('m1');
      const m2 = new TestMiddleware('m2');
      pipeline.use(m1);
      pipeline.insertAfter('m1', m2);
      expect(pipeline.getMiddlewares()[1]).toBe(m2);
    });
  });

  describe('Enable/Disable', () => {
    it('should enable/disable pipeline', () => {
      pipeline.setEnabled(false);
      expect(pipeline.isEnabled()).toBe(false);
      pipeline.setEnabled(true);
      expect(pipeline.isEnabled()).toBe(true);
    });

    it('should skip processing when disabled', () => {
      const context: MiddlewareContext = { data: 'test', operation: 'serialize' };
      pipeline.setEnabled(false);
      pipeline.use(new TestMiddleware('m1', ctx => { ctx.data = 'modified'; return ctx; }));
      const result = pipeline.processSync(context);
      expect(result.data).toBe('test');
    });
  });
});
