/**
 * IEventDispatcher - Application Interface
 * 
 * Interface for dispatching events to registered handlers.
 * Coordinates event flow with middleware and policies.
 */

import { Event } from '../../domain/entities/Event';
import { DispatchResult } from './types';

export interface DispatchOptions {
  async?: boolean;
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface IEventDispatcher {
  dispatch<T>(event: Event<T>, options?: DispatchOptions): Promise<DispatchResult>;
  dispatchBatch<T>(events: Event<T>[], options?: DispatchOptions): Promise<DispatchResult[]>;
  addMiddleware(middleware: DispatchMiddleware): void;
  removeMiddleware(middleware: DispatchMiddleware): void;
}

export type DispatchMiddleware = (
  event: Event,
  next: () => Promise<void>
) => Promise<void>;
