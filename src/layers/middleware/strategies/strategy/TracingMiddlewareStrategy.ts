/**
 * Tracing Middleware Strategy
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export class TracingMiddlewareStrategy implements IMiddlewareStrategy {
  private readonly _serviceName: string;

  constructor(serviceName: string = 'one-million-hello-world') {
    this._serviceName = serviceName;
  }

  getName(): string {
    return 'TRACING';
  }

  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const traceId = `trace-${context.data.timestamp}`;
    const spanId = `${traceId}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const result = context
      .setMetadata('traceId', traceId)
      .setMetadata('spanId', spanId)
      .setMetadata('serviceName', this._serviceName)
      .setMetadata('traceTimestamp', timestamp);
    return Promise.resolve(result);
  }
}
