import { DomainEntity } from '../types/domain-types';
import { MessageContent } from '../value-objects/MessageContent';

export class HelloWorldMessage implements DomainEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly content: MessageContent;
  readonly language: string;
  readonly format: string;
  readonly version: number;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly auditTrail: AuditEntry[];

  constructor(
    id: string,
    content: MessageContent,
    language: string = 'en',
    format: string = 'json',
    options?: {
      version?: number;
      createdBy?: string;
      updatedBy?: string;
      auditTrail?: AuditEntry[];
      createdAt?: Date;
      updatedAt?: Date;
    }
  ) {
    this.id = id;
    this.content = content;
    this.language = language;
    this.format = format;
    this.version = options?.version ?? 1;
    this.createdBy = options?.createdBy;
    this.updatedBy = options?.updatedBy;
    this.auditTrail = options?.auditTrail ?? [];
    this.createdAt = options?.createdAt ?? new Date();
    this.updatedAt = options?.updatedAt ?? new Date();
  }

  static create(content: string): HelloWorldMessage {
    return new HelloWorldMessage(
      `hw-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      MessageContent.create(content)
    );
  }

  withLanguage(language: string): HelloWorldMessage {
    return new HelloWorldMessage(this.id, this.content, language, this.format, {
      version: this.version,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      auditTrail: [...this.auditTrail, { action: 'language_change', value: language, timestamp: new Date() }],
      createdAt: this.createdAt,
    });
  }

  withFormat(format: string): HelloWorldMessage {
    return new HelloWorldMessage(this.id, this.content, this.language, format, {
      version: this.version,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      auditTrail: [...this.auditTrail, { action: 'format_change', value: format, timestamp: new Date() }],
      createdAt: this.createdAt,
    });
  }

  withVersion(version: number, updatedBy?: string): HelloWorldMessage {
    return new HelloWorldMessage(this.id, this.content, this.language, this.format, {
      version,
      createdBy: this.createdBy,
      updatedBy,
      auditTrail: [...this.auditTrail, { action: 'version_bump', value: String(version), timestamp: new Date() }],
      createdAt: this.createdAt,
    });
  }

  toPayload(): Record<string, unknown> {
    return {
      id: this.id,
      message: this.content.value,
      language: this.language,
      format: this.format,
      version: this.version,
      timestamp: this.createdAt.toISOString(),
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
    };
  }

  toAuditSnapshot(): Record<string, unknown> {
    return {
      ...this.toPayload(),
      auditTrail: this.auditTrail.map((e) => ({ ...e, timestamp: e.timestamp.toISOString() })),
    };
  }
}

export interface AuditEntry {
  action: string;
  value: string;
  timestamp: Date;
}
