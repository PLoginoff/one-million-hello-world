import { HandlerFunction } from '../types/controller-types';
import { IService } from '../../service/interfaces/IService';
import { GetHelloWorldInput } from '../../service/use-cases/GetHelloWorldUseCase';

export function createHelloWorldHandler(service: IService): HandlerFunction {
  return async (context) => {
    const requestId = context.requestId;
    const correlationId = context.correlationId;

    const serviceContext = service.createContext(context.userId, correlationId, requestId);

    const input: GetHelloWorldInput = {
      language: context.parameters['language'] || 'en',
      format: context.parameters['format'] || 'json',
      requestId,
      correlationId,
    };

    const result = await service.execute<GetHelloWorldInput, Record<string, unknown>>(
      'GetHelloWorld',
      input,
      serviceContext
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        response: {
          statusCode: 500,
          headers: new Map([['content-type', 'application/json']]),
          body: Buffer.from(JSON.stringify({ error: result.error?.message || 'Internal Server Error' })),
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
