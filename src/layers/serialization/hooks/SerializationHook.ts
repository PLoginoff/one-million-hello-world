/**
 * Serialization Hook Types
 * 
 * Defines hook types and contexts for serialization operations.
 */

export enum HookType {
  BEFORE_SERIALIZE = 'beforeSerialize',
  AFTER_SERIALIZE = 'afterSerialize',
  BEFORE_DESERIALIZE = 'beforeDeserialize',
  AFTER_DESERIALIZE = 'afterDeserialize',
  ON_ERROR = 'onError',
}

export interface HookContext {
  operation: 'serialize' | 'deserialize';
  format?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type HookFunction<T = unknown> = (
  data: T,
  context: HookContext
) => T | Promise<T>;

export type ErrorHookFunction = (
  error: Error,
  context: HookContext
) => void | Promise<void>;

export interface SerializationHook {
  type: HookType;
  fn: HookFunction | ErrorHookFunction;
  priority?: number;
  name?: string;
}
