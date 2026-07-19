/**
 * Domain Factory
 *
 * Factory for creating domain entities, value objects, and events.
 * Provides centralized creation with validation and defaults.
 */

import { HelloWorldMessage, AuditEntry } from '../entities/HelloWorldMessage';
import { MessageContent } from '../value-objects/MessageContent';
import { RequestId } from '../value-objects/RequestId';
import { CorrelationId } from '../value-objects/CorrelationId';
import { Timestamp } from '../value-objects/Timestamp';
import { HelloWorldRequested } from '../events/HelloWorldRequested';
import { HelloWorldFactory, HelloWorldOptions } from './HelloWorldFactory';

export class DomainFactory {
  private readonly _helloWorldFactory: HelloWorldFactory;

  constructor() {
    this._helloWorldFactory = new HelloWorldFactory();
  }

  createHelloWorldMessage(content: string, options?: HelloWorldOptions): HelloWorldMessage {
    return this._helloWorldFactory.create({ ...options, suffix: options?.suffix });
  }

  createMessageContent(content: string): MessageContent {
    return MessageContent.create(content);
  }

  createRequestId(value?: string): RequestId {
    return value !== undefined ? RequestId.create(value) : RequestId.generate();
  }

  createCorrelationId(value?: string): CorrelationId {
    return value !== undefined ? CorrelationId.create(value) : CorrelationId.generate();
  }

  createTimestamp(date?: Date): Timestamp {
    return Timestamp.create(date ?? new Date());
  }

  createHelloWorldRequestedEvent(
    requestId: string,
    correlationId: string,
    language: string,
    format: string
  ): HelloWorldRequested {
    return HelloWorldRequested.create(requestId, correlationId, language, format);
  }

  createAuditEntry(action: string, value: string): AuditEntry {
    return { action, value, timestamp: new Date() };
  }

  getSupportedLanguages(): string[] {
    return this._helloWorldFactory.getSupportedLanguages();
  }

  supportsLanguage(language: string): boolean {
    return this._helloWorldFactory.supportsLanguage(language);
  }
}
