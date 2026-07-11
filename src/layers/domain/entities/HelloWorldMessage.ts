import { DomainEntity } from '../types/domain-types';
import { MessageContent } from '../value-objects/MessageContent';

export class HelloWorldMessage implements DomainEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly content: MessageContent;
  readonly language: string;
  readonly format: string;

  constructor(id: string, content: MessageContent, language: string = 'en', format: string = 'json') {
    this.id = id;
    this.content = content;
    this.language = language;
    this.format = format;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static create(content: string): HelloWorldMessage {
    return new HelloWorldMessage(
      `hw-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      MessageContent.create(content)
    );
  }

  withLanguage(language: string): HelloWorldMessage {
    return new HelloWorldMessage(this.id, this.content, language, this.format);
  }

  withFormat(format: string): HelloWorldMessage {
    return new HelloWorldMessage(this.id, this.content, this.language, format);
  }

  toPayload(): Record<string, unknown> {
    return {
      id: this.id,
      message: this.content.value,
      language: this.language,
      format: this.format,
      timestamp: this.createdAt.toISOString(),
    };
  }
}
