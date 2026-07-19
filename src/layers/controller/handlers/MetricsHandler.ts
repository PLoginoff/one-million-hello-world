import { HandlerFunction } from '../types/controller-types';
import { IService } from '../../service/interfaces/IService';

export function createMetricsHandler(service: IService): HandlerFunction {
  return async (context) => {
    const serviceContext = service.createContext(context.userId, context.correlationId, context.requestId);

    const result = await service.execute<{ requestId: string; correlationId: string }, Record<string, unknown>>(
      'GetMetrics',
      {
        requestId: context.requestId,
        correlationId: context.correlationId,
      },
      serviceContext
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        response: {
          statusCode: 500,
          headers: new Map([['content-type', 'application/json']]),
          body: Buffer.from(JSON.stringify({ error: result.error?.message ?? 'Internal Server Error' })),
        },
      };
    }

    return {
      success: true,
      response: {
        statusCode: 200,
        headers: new Map([['content-type', 'application/json']]),
        body: Buffer.from(JSON.stringify(result.data)),
      },
    };
  };
}
