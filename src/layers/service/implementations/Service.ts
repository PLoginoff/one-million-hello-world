/**
 * Service Implementation
 * 
 * Concrete implementation of IService.
 * Handles business logic, use cases, and domain operations.
 */

import { IService } from '../interfaces/IService';
import {
  ServiceResult,
  ServiceContext,
  UseCase,
  ServiceConfig,
  ServiceError,
} from '../types/service-types';

export class Service implements IService {
  private _useCases: Map<string, UseCase<unknown, unknown>>;
  private _config: ServiceConfig;

  constructor() {
    this._useCases = new Map();
    this._config = {
      enableCaching: false,
      cacheTimeout: 60000,
      enableRetry: false,
      maxRetries: 3,
    };
  }

  async execute<TInput, TOutput>(
    useCaseName: string,
    input: TInput,
    context: ServiceContext
  ): Promise<ServiceResult<TOutput>> {
    const useCase = this._useCases.get(useCaseName) as UseCase<TInput, TOutput> | undefined;

    if (!useCase) {
      return {
        success: false,
        error: {
          code: 'USE_CASE_NOT_FOUND',
          message: `Use case '${useCaseName}' not found`,
        },
      };
    }

    try {
      return await useCase.execute(input, context);
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  registerUseCase<TInput, TOutput>(useCase: UseCase<TInput, TOutput>): void {
    this._useCases.set(useCase.name, useCase);
  }

  getUseCase<TInput, TOutput>(useCaseName: string): UseCase<TInput, TOutput> | undefined {
    return this._useCases.get(useCaseName) as UseCase<TInput, TOutput> | undefined;
  }

  createContext(userId: string | undefined, correlationId: string, requestId: string): ServiceContext {
    return {
      userId,
      correlationId,
      requestId,
      timestamp: new Date(),
    };
  }

  setConfig(config: ServiceConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): ServiceConfig {
    return { ...this._config };
  }

  clearUseCases(): void {
    this._useCases.clear();
  }
}
