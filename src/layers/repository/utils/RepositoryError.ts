/**
 * Repository Error
 * 
 * Custom error class for repository errors.
 */

export class RepositoryError extends Error {
  readonly code: string;
  readonly repositoryId?: string;

  constructor(code: string, message: string, repositoryId?: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.repositoryId = repositoryId;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create repository not found error
   */
  static notFound(message: string = 'Repository not found', repositoryId?: string): RepositoryError {
    return new RepositoryError('REPOSITORY_NOT_FOUND', message, repositoryId);
  }

  /**
   * Create repository already registered error
   */
  static alreadyRegistered(message: string = 'Repository already registered', repositoryId?: string): RepositoryError {
    return new RepositoryError('REPOSITORY_ALREADY_REGISTERED', message, repositoryId);
  }

  /**
   * Create query execution error
   */
  static queryFailed(message: string = 'Query execution failed', repositoryId?: string): RepositoryError {
    return new RepositoryError('QUERY_FAILED', message, repositoryId);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    repositoryId?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      repositoryId: this.repositoryId,
      stack: this.stack,
    };
  }
}
