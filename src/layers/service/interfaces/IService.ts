/**
 * Service Interface
 * 
 * Defines the contract for service operations
 * including business logic, use cases, and domain operations.
 */

import {
  ServiceResult,
  ServiceContext,
  UseCase,
  ServiceConfig,
} from '../types/service-types';

/**
 * Interface for service operations
 */
export interface IService {
  /**
   * Executes a use case with given input and context
   * 
   * @param useCaseName - Name of the use case to execute
   * @param input - Input data for the use case
   * @param context - Service context
   * @returns Service result
   */
  execute<TInput, TOutput>(
    useCaseName: string,
    input: TInput,
    context: ServiceContext
  ): Promise<ServiceResult<TOutput>>;

  /**
   * Registers a use case
   * 
   * @param useCase - Use case to register
   */
  registerUseCase<TInput, TOutput>(useCase: UseCase<TInput, TOutput>): void;

  /**
   * Gets a registered use case
   * 
   * @param useCaseName - Name of the use case
   * @returns Use case or undefined
   */
  getUseCase<TInput, TOutput>(useCaseName: string): UseCase<TInput, TOutput> | undefined;

  /**
   * Creates a service context
   * 
   * @param userId - Optional user ID
   * @param correlationId - Correlation ID
   * @param requestId - Request ID
   * @returns Service context
   */
  createContext(userId: string | undefined, correlationId: string, requestId: string): ServiceContext;

  /**
   * Sets service configuration
   * 
   * @param config - Service configuration
   */
  setConfig(config: ServiceConfig): void;

  /**
   * Gets current service configuration
   * 
   * @returns Current service configuration
   */
  getConfig(): ServiceConfig;

  /**
   * Clears all registered use cases
   */
  clearUseCases(): void;
}
