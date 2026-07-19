/**
 * Controller → Service Integration Test
 *
 * Verifies that the Controller delegates to the Service layer
 * for business logic execution, and results flow back correctly.
 */

import { Controller } from '../../controller/implementations/Controller';
import { Service } from '../implementations/Service';
import { UseCase, ServiceContext } from '../types/service-types';
import { HttpStatusCode } from '../../controller/types/controller-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';

describe('Controller → Service Integration', () => {
  let controller: Controller;
  let service: Service;

  beforeEach(() => {
    controller = new Controller();
    service = new Service();

    const helloUseCase: UseCase<string, string> = {
      name: 'hello',
      execute: async (input: string, _context: ServiceContext) => {
        const name = input || 'world';
        return {
          success: true,
          data: `Hello, ${name}!`,
        };
      },
    };

    service.registerUseCase(helloUseCase);

    controller.registerHandler('helloHandler', async (ctx) => {
      const name = ctx.parameters['name'] ?? '';
      const serviceContext = service.createContext(
        ctx.userId,
        ctx.correlationId,
        ctx.requestId
      );
      const result = await service.execute<string, string>('hello', name, serviceContext);

      if (result.success && result.data !== undefined) {
        return controller.createSuccessResponse(
          JSON.stringify({ message: result.data }),
          HttpStatusCode.OK
        );
      }
      return controller.createErrorResponse(
        result.error?.message ?? 'Service error',
        HttpStatusCode.INTERNAL_SERVER_ERROR
      );
    });
  });

  it('should delegate from controller to service and return result', async () => {
    const request = {
      line: {
        method: HttpMethod.GET,
        path: '/hello/devin',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const context = controller.createContext(request, { name: 'devin' });
    const handler = controller.getHandler('helloHandler')!;
    const result = await controller.handle(request, handler, context);

    expect(result.success).toBe(true);
    expect(result.response!.statusCode).toBe(HttpStatusCode.OK);
    expect(result.response!.body.toString()).toContain('Hello, devin!');
  });

  it('should use default name when parameter is empty', async () => {
    const request = {
      line: {
        method: HttpMethod.GET,
        path: '/hello',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const context = controller.createContext(request, {});
    const handler = controller.getHandler('helloHandler')!;
    const result = await controller.handle(request, handler, context);

    expect(result.success).toBe(true);
    expect(result.response!.body.toString()).toContain('Hello, world!');
  });

  it('should return error for unknown use case', async () => {
    controller.registerHandler('unknownHandler', async (ctx) => {
      const serviceContext = service.createContext(ctx.userId, ctx.correlationId, ctx.requestId);
      const result = await service.execute('nonExistent', 'input', serviceContext);

      if (!result.success) {
        return controller.createErrorResponse(result.error!.message, HttpStatusCode.NOT_FOUND);
      }
      return controller.createSuccessResponse('ok');
    });

    const request = {
      line: {
        method: HttpMethod.GET,
        path: '/unknown',
        version: HttpVersion.HTTP_1_1,
      },
      headers: new Map(),
      body: Buffer.from(''),
      raw: Buffer.from(''),
    };

    const context = controller.createContext(request, {});
    const handler = controller.getHandler('unknownHandler')!;
    const result = await controller.handle(request, handler, context);

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe(HttpStatusCode.NOT_FOUND);
  });
});
