/**
 * Repository Errors
 *
 * Exports all repository error classes.
 */

export { RepositoryError } from './RepositoryError';
export { ConnectionError, type ConnectionErrorDetails } from './ConnectionError';
export { QueryError, type QueryErrorDetails } from './QueryError';
export { NotFoundError, type NotFoundErrorDetails } from './NotFoundError';
export {
  ConstraintViolationError,
  type ConstraintViolationErrorDetails,
  type ConstraintType,
} from './ConstraintViolationError';
