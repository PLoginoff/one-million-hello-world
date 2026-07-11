import { DomainEvent } from '../types/domain-types';

export interface HelloWorldRequestedData {
  requestId: string;
  correlationId: string;
  language: string;
  format: string;
  timestamp: Date;
}

export class HelloWorldRequested implements DomainEvent {
  readonly eventType = 'HelloWorldRequested';
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly data: Record<string, unknown>;

  constructor(requestId: string, correlationId: string, language: string, format: string) {
    this.aggregateId = requestId;
    this.occurredAt = new Date();
    this.data = {
      requestId,
      correlationId,
      language,
      format,
      timestamp: this.occurredAt,
    };
  }

  static create(requestId: string, correlationId: string, language: string, format: string): HelloWorldRequested {
    return new HelloWorldRequested(requestId, correlationId, language, format);
  }
}
