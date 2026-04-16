/**
 * Repository Handler Implementation
 * 
 * Concrete implementation of IRepositoryHandler.
 * Encapsulates business logic for repository operations
 * with validation, metrics, and middleware support.
 */

import { DomainEntity } from '../../domain/types/domain-types';
import { IRepository } from '../interfaces/IRepository';
import {
  IRepositoryHandler,
  HandlerContext,
  HandlerResult,
  HandlerError,
  HandlerMetrics,
  HandlerConfig,
} from '../interfaces/IRepositoryHandler';
import {
  QueryOptions,
  RepositoryResult,
} from '../types/repository-types';
import {
  RepositoryOperation,
  HandlerMiddleware,
  ValidationRule,
  ValidationResult,
} from '../types/handler-types';

export class RepositoryHandler<T extends DomainEntity> implements IRepositoryHandler<T> {
  private _repository: IRepository<T>;
  private _config: HandlerConfig;
  private _middlewares: Map<RepositoryOperation, HandlerMiddleware[]>;
  private _validationRules: ValidationRule[];

  constructor(repository: IRepository<T>, config?: Partial<HandlerConfig>) {
    this._repository = repository;
    this._config = {
      enableMetrics: true,
      enableValidation: true,
      enableCaching: false,
      enableTransactions: false,
      maxRetries: 3,
      ...config,
    };
    this._middlewares = new Map();
    this._validationRules = [];
    this._initializeMiddlewares();
  }

  async handleFind(
    options?: QueryOptions,
    _context?: HandlerContext
  ): Promise<HandlerResult<T[]>> {
    const startTime = Date.now();

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.FIND,
        () => this._repository.find(options)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  async handleFindById(
    id: string,
    _context?: HandlerContext
  ): Promise<HandlerResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.FIND_BY_ID,
        () => this._repository.findById(id)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  async handleSave(
    entity: T,
    _context?: HandlerContext
  ): Promise<HandlerResult<T>> {
    const startTime = Date.now();

    if (this._config.enableValidation) {
      const validation = this._validateEntity(entity);
      if (!validation.valid) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.errors.join(', '),
            retryable: false,
          },
          metrics: this._createMetrics(startTime),
        };
      }
    }

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.SAVE,
        () => this._repository.save(entity)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  async handleDelete(
    id: string,
    _context?: HandlerContext
  ): Promise<HandlerResult<void>> {
    const startTime = Date.now();

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.DELETE,
        () => this._repository.delete(id)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  async handleCount(
    options?: QueryOptions,
    _context?: HandlerContext
  ): Promise<HandlerResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.COUNT,
        () => this._repository.count(options)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  async handleExists(
    id: string,
    _context?: HandlerContext
  ): Promise<HandlerResult<boolean>> {
    const startTime = Date.now();

    try {
      const result = await this._executeWithMiddleware(
        RepositoryOperation.EXISTS,
        () => this._repository.exists(id)
      );

      const metrics = this._createMetrics(startTime);

      return {
        success: result.success,
        data: result.data,
        error: result.error ? this._convertError(result.error) : undefined,
        metrics,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          retryable: true,
        },
        metrics: this._createMetrics(startTime),
      };
    }
  }

  createContext(operation: string, metadata?: Record<string, unknown>): HandlerContext {
    return {
      operation,
      timestamp: new Date(),
      metadata,
    };
  }

  setConfig(config: HandlerConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): HandlerConfig {
    return { ...this._config };
  }

  addMiddleware(operation: RepositoryOperation, middleware: HandlerMiddleware): void {
    const middlewares = this._middlewares.get(operation) || [];
    middlewares.push(middleware);
    this._middlewares.set(operation, middlewares);
  }

  addValidationRule(rule: ValidationRule): void {
    this._validationRules.push(rule);
  }

  private _initializeMiddlewares(): void {
    Object.values(RepositoryOperation).forEach((op) => {
      this._middlewares.set(op, []);
    });
  }

  private async _executeWithMiddleware<U>(
    operation: RepositoryOperation,
    fn: () => Promise<RepositoryResult<U>>
  ): Promise<RepositoryResult<U>> {
    const middlewares = this._middlewares.get(operation) || [];

    for (const middleware of middlewares) {
      await middleware(operation, async () => {});
    }

    return fn();
  }

  private _validateEntity(entity: T): ValidationResult {
    const errors: string[] = [];

    for (const rule of this._validationRules) {
      const value = (entity as Record<string, unknown>)[rule.field];
      if (value !== undefined && !rule.validator(value)) {
        errors.push(rule.errorMessage);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private _convertError(error: { code: string; message: string }): HandlerError {
    return {
      code: error.code,
      message: error.message,
      retryable: error.code !== 'VALIDATION_ERROR',
    };
  }

  private _createMetrics(startTime: number): HandlerMetrics {
    return {
      executionTime: Date.now() - startTime,
    };
  }
}
