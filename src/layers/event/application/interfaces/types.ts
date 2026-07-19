/**
 * Application Layer Types
 *
 * Shared types for application layer components.
 */

export interface DispatchResult {
  success: boolean;
  eventId: string;
  eventType: string;
  handlersExecuted: number;
  handlersSucceeded: number;
  handlersFailed: number;
  executionTime: number;
  errors?: Error[];
}

export interface DispatchPolicy {
  name: string;
  shouldDispatch: (event: unknown) => boolean;
  onDispatch?: (event: unknown) => void;
  onError?: (event: unknown, error: Error) => void;
}

export interface EventHandlerMetadata {
  name?: string;
  description?: string;
  version?: string;
  deprecated?: boolean;
  tags?: string[];
}
