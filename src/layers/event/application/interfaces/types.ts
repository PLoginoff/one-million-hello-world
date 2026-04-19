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
  shouldDispatch: (event: any) => boolean;
  onDispatch?: (event: any) => void;
  onError?: (event: any, error: Error) => void;
}

export interface EventHandlerMetadata {
  name?: string;
  description?: string;
  version?: string;
  deprecated?: boolean;
  tags?: string[];
}
