import { DomainEntity } from '../types/domain-types';

export class RequestLog implements DomainEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly requestId: string;
  readonly correlationId: string;
  readonly path: string;
  readonly method: string;
  readonly statusCode: number;
  readonly durationMs: number;
  readonly metadata: Record<string, unknown>;

  constructor(
    id: string,
    requestId: string,
    correlationId: string,
    path: string,
    method: string,
    statusCode: number,
    durationMs: number,
    metadata: Record<string, unknown> = {}
  ) {
    this.id = id;
    this.requestId = requestId;
    this.correlationId = correlationId;
    this.path = path;
    this.method = method;
    this.statusCode = statusCode;
    this.durationMs = durationMs;
    this.metadata = metadata;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static create(
    requestId: string,
    correlationId: string,
    path: string,
    method: string,
    statusCode: number,
    durationMs: number,
    metadata: Record<string, unknown> = {}
  ): RequestLog {
    return new RequestLog(
      `log-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      requestId,
      correlationId,
      path,
      method,
      statusCode,
      durationMs,
      metadata
    );
  }

  isSuccessful(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  toPayload(): Record<string, unknown> {
    return {
      id: this.id,
      requestId: this.requestId,
      correlationId: this.correlationId,
      path: this.path,
      method: this.method,
      statusCode: this.statusCode,
      durationMs: this.durationMs,
      createdAt: this.createdAt.toISOString(),
      metadata: this.metadata,
    };
  }
}
