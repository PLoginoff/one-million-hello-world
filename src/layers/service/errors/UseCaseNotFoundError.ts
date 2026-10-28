/**
 * Use Case Not Found Error
 *
 * Thrown when a requested use case is not registered in the service.
 *
 * @module ServiceLayer/Errors
 */

import { ServiceError, ServiceErrorDetails } from './ServiceError';

/**
 * Error thrown when a use case cannot be found.
 */
export class UseCaseNotFoundError extends ServiceError {
  /** The name of the use case that was not found */
  readonly useCaseName: string;

  /**
   * Creates a new UseCaseNotFoundError instance.
   *
   * @param useCaseName - Name of the use case that was not found
   * @param availableUseCases - Optional list of available use case names
   */
  constructor(useCaseName: string, availableUseCases?: string[]) {
    const details: ServiceErrorDetails = { useCaseName };
    if (availableUseCases && availableUseCases.length > 0) {
      details.availableUseCases = availableUseCases;
    }

    super('USE_CASE_NOT_FOUND', `Use case '${useCaseName}' not found`, {
      statusCode: 404,
      details,
      retryable: false,
    });

    this.name = 'UseCaseNotFoundError';
    this.useCaseName = useCaseName;
  }

  /**
   * Creates a UseCaseNotFoundError with suggestions for similar use case names.
   *
   * @param useCaseName - Name of the use case that was not found
   * @param availableUseCases - List of available use case names
   * @returns UseCaseNotFoundError with suggestions
   */
  static withSuggestions(useCaseName: string, availableUseCases: string[]): UseCaseNotFoundError {
    // Simple Levenshtein-like suggestion: find use cases with similar prefixes
    const suggestions = availableUseCases
      .filter((name) => name.startsWith(useCaseName.slice(0, 3)) || useCaseName.startsWith(name.slice(0, 3)))
      .slice(0, 3);

    const error = new UseCaseNotFoundError(useCaseName, availableUseCases);
    if (suggestions.length > 0) {
      error.details!.suggestions = suggestions;
    }
    return error;
  }
}
