/**
 * Router → Controller Integration Test
 *
 * Verifies that the Router matches a request and the Controller
 * processes the matched route, producing a correct response.
 */

import { Router } from '../../router/implementations/Router';
import { Controller } from '../implementations/Controller';
import { HttpMethod as RouterHttpMethod } from '../../router/types/router-types';
import { HttpMethod as ParserHttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { HttpStatusCode } from '../types/controller-types';

describe('Router → Controller Integration', () => {
  let router: Router;
  let controller: Controller;

  beforeEach(() => {
    router = new Router();
    controller = new Controller();

    router.registerRoute({
      method: RouterHttpMethod.GET,
      path: '/hello/:name',
      handler: 'helloHandler',
    });

    controller.registerHandler('helloHandler', async (ctx) => {
      const name = ctx.parameters['name'] ?? 'world';
      return controller.createSuccessResponse(JSON.stringify({ message: `Hello, ${name}!` }), HttpStatusCode.OK);
    });
  });

  it('should route a GET request and return hello response', async () => {
    const request = {
      line: {
        method: ParserHttpMethod.GET,
        path: '/hello/devin',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const match = router.match(request);
    expect(match.matched).toBe(true);
    expect(match.route).toBeDefined();
    expect(match.route!.handler).toBe('helloHandler');
    expect(match.parameters!['name']).toBe('devin');

    const handler = controller.getHandler(match.route!.handler);
    expect(handler).toBeDefined();

    const context = controller.createContext(request, match.parameters ?? {});
    const result = await controller.handle(request, handler!, context);

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.statusCode).toBe(HttpStatusCode.OK);
    expect(result.response!.body.toString()).toContain('Hello, devin!');
  });

  it('should return 404 for unmatched route', () => {
    const request = {
      line: {
        method: ParserHttpMethod.GET,
        path: '/unknown/path',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const match = router.match(request);
    expect(match.matched).toBe(false);
    expect(match.route).toBeUndefined();
  });

  it('should handle default parameter value', async () => {
    router.registerRoute({
      method: RouterHttpMethod.GET,
      path: '/hello',
      handler: 'helloDefaultHandler',
    });

    controller.registerHandler('helloDefaultHandler', async (ctx) => {
      const name = ctx.parameters['name'] ?? 'world';
      return controller.createSuccessResponse(JSON.stringify({ message: `Hello, ${name}!` }), HttpStatusCode.OK);
    });

    const request = {
      line: {
        method: ParserHttpMethod.GET,
        path: '/hello',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const match = router.match(request);
    expect(match.matched).toBe(true);

    const handler = controller.getHandler(match.route!.handler);
    const context = controller.createContext(request, match.parameters ?? {});
    const result = await controller.handle(request, handler!, context);

    expect(result.success).toBe(true);
    expect(result.response!.body.toString()).toContain('Hello, world!');
  });

  it('should handle errors gracefully', async () => {
    controller.registerHandler('errorHandler', async () => {
      throw new Error('Handler crashed');
    });

    router.registerRoute({
      method: RouterHttpMethod.GET,
      path: '/error',
      handler: 'errorHandler',
    });

    const request = {
      line: {
        method: ParserHttpMethod.GET,
        path: '/error',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const match = router.match(request);
    expect(match.matched).toBe(true);

    const handler = controller.getHandler(match.route!.handler);
    const context = controller.createContext(request, match.parameters ?? {});
    const result = await controller.handle(request, handler!, context);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
    expect(result.error!.message).toContain('Handler crashed');
  });
});
