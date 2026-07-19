/**
 * Search Types
 */

export interface SearchContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SearchError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SearchResult<T> {
  success: boolean;
  data?: T;
  error?: SearchError;
}
