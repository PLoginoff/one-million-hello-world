/**
 * Controller Unit Tests
 * 
 * Tests for Controller implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Controller } from '../implementations/Controller';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { HttpStatusCode } from '../types/controller-types';

describe('Controller', () => {
  let controller: Controller;

  beforeEach(() => {
    controller = new Controller();
  });

  describe('createContext', () => {
    it('should create context from request', () => {
      const request = createMockRequest();
      const parameters = { id: '123' };

      const context = controller.createContext(request, parameters);

      expect(context.requestId).toBeDefined();
      expect(context.correlationId).toBeDefined();
      expect(context.parameters).toEqual(parameters);
    });

    it('should extract IDs from headers', () => {
      const request = createMockRequest();
      request.headers.set('x-request-id', 'req-123');
      request.headers.set('x-correlation-id', 'corr-456');
      request.headers.set('x-user-id', 'user-789');

      const context = controller.createContext(request, {});

      expect(context.requestId).toBe('req-123');
      expect(context.correlationId).toBe('corr-456');
      expect(context.userId).toBe('user-789');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with default status', () => {
      const result = controller.createSuccessResponse('Hello World');

      expect(result.success).toBe(true);
      expect(result.response?.statusCode).toBe(HttpStatusCode.OK);
      expect(result.response?.body.toString()).toBe('Hello World');
    });

    it('should create success response with custom status', () => {
      const result = controller.createSuccessResponse('Created', 201);

      expect(result.success).toBe(true);
      expect(result.response?.statusCode).toBe(HttpStatusCode.CREATED);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with default status', () => {
      const result = controller.createErrorResponse('Not found');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
      expect(result.error?.message).toBe('Not found');
    });

    it('should create error response with custom status', () => {
      const result = controller.createErrorResponse('Not found', 404);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(HttpStatusCode.NOT_FOUND);
    });

    it('should include error details', () => {
      const details = { field: 'id', value: 'invalid' };
      const result = controller.createErrorResponse('Validation error', 400, details);

      expect(result.error?.details).toEqual(details);
    });
  });

  describe('registerHandler', () => {
    it('should register handler for operation', () => {
      const handler = async () => controller.createSuccessResponse('OK');
      controller.registerHandler('test', handler);

      const retrieved = controller.getHandler('test');

      expect(retrieved).toBe(handler);
    });
  });

  describe('getHandler', () => {
    it('should return undefined for unregistered handler', () => {
      const retrieved = controller.getHandler('nonexistent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('handle', () => {
    it('should execute handler successfully', async () => {
      const handler = async () => controller.createSuccessResponse('Success');
      const context = controller.createContext(createMockRequest(), {});

      const result = await controller.handle(createMockRequest(), handler, context);

      expect(result.success).toBe(true);
    });

    it('should handle handler errors', async () => {
      const handler = async () => {
        throw new Error('Handler error');
      };
      const context = controller.createContext(createMockRequest(), {});

      const result = await controller.handle(createMockRequest(), handler, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Handler error');
    });
  });
});

function createMockRequest(): HttpRequest {
  return {
    line: {
      method: HttpMethod.GET,
      path: '/',
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'),
  };
}
