import { UseCase, ServiceResult, ServiceContext, ServiceError } from '../types/service-types';
import { HelloWorldMessage } from '../../domain/entities/HelloWorldMessage';
import { HelloWorldRequested } from '../../domain/events/HelloWorldRequested';
import { DomainManager } from '../../domain/implementations/DomainManager';
import { HelloWorldFactory } from '../../domain/services/HelloWorldFactory';
import { MessagePolicy } from '../../domain/services/MessagePolicy';

export interface GetHelloWorldInput {
  language?: string;
  format?: string;
  requestId: string;
  correlationId: string;
  suffix?: string;
}

export interface GetHelloWorldOutput {
  message: string;
  timestamp: string;
  language: string;
  format: string;
  requestId: string;
  supportedLanguages: string[];
}

export class GetHelloWorldUseCase implements UseCase<GetHelloWorldInput, GetHelloWorldOutput> {
  readonly name = 'GetHelloWorld';
  private readonly _domainManager: DomainManager;
  private readonly _factory: HelloWorldFactory;
  private readonly _policy: MessagePolicy;
  private _dailyCount: number;

  constructor(domainManager: DomainManager) {
    this._domainManager = domainManager;
    this._factory = new HelloWorldFactory();
    this._policy = new MessagePolicy();
    this._dailyCount = 0;
  }

  async execute(input: GetHelloWorldInput, context: ServiceContext): Promise<ServiceResult<GetHelloWorldOutput>> {
    try {
      const language = input.language || 'en';
      const format = input.format || 'json';

      if (!this._policy.isFormatAllowed(format)) {
        return this._error(`Format ${format} is not supported`);
      }

      if (!this._factory.supportsLanguage(language)) {
        return this._error(`Language ${language} is not supported`);
      }

      const message = this._factory.create({ language, format, suffix: input.suffix });
      const policyCheck = this._policy.canServe(message, this._dailyCount);
      if (!policyCheck.allowed) {
        return this._error(policyCheck.reason || 'Message policy rejected request');
      }

      this._dailyCount++;

      const event = HelloWorldRequested.create(input.requestId, input.correlationId, language, format);
      this._domainManager.publishEvent(event);

      const result: GetHelloWorldOutput = {
        message: message.content.value,
        timestamp: new Date().toISOString(),
        language: message.language,
        format: message.format,
        requestId: input.requestId,
        supportedLanguages: this._factory.getSupportedLanguages(),
      };

      return { success: true, data: result };
    } catch (error) {
      return this._error(error instanceof Error ? error.message : 'Unknown error during Hello World execution');
    }
  }

  private _error(message: string): ServiceResult<GetHelloWorldOutput> {
    const error: ServiceError = {
      code: 'HELLO_WORLD_EXECUTION_ERROR',
      message,
    };
    return { success: false, error };
  }
}
