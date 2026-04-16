/**
 * Handler Types
 * 
 * Type definitions for the Repository Handler layer
 * including operation types and middleware chains.
 */

/**
 * Repository operation type
 */
export enum RepositoryOperation {
  FIND = 'FIND',
  FIND_BY_ID = 'FIND_BY_ID',
  SAVE = 'SAVE',
  DELETE = 'DELETE',
  COUNT = 'COUNT',
  EXISTS = 'EXISTS',
}

/**
 * Handler middleware function
 */
export type HandlerMiddleware = (
  operation: RepositoryOperation,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Middleware chain
 */
export interface MiddlewareChain {
  middlewares: HandlerMiddleware[];
  execute(operation: RepositoryOperation): Promise<void>;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  field: string;
  validator: (value: unknown) => boolean;
  errorMessage: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
