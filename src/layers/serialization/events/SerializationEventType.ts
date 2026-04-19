/**
 * Serialization Event Types
 * 
 * Enumeration of serialization-related event types.
 */

export enum SerializationEventType {
  /**
   * Fired before serialization starts
   */
  BEFORE_SERIALIZE = 'before:serialize',

  /**
   * Fired after serialization completes
   */
  AFTER_SERIALIZE = 'after:serialize',

  /**
   * Fired before deserialization starts
   */
  BEFORE_DESERIALIZE = 'before:deserialize',

  /**
   * Fired after deserialization completes
   */
  AFTER_DESERIALIZE = 'after:deserialize',

  /**
   * Fired when a serialization error occurs
   */
  SERIALIZATION_ERROR = 'serialization:error',

  /**
   * Fired when a deserialization error occurs
   */
  DESERIALIZATION_ERROR = 'deserialization:error',

  /**
   * Fired when validation starts
   */
  VALIDATION_START = 'validation:start',

  /**
   * Fired when validation completes
   */
  VALIDATION_COMPLETE = 'validation:complete',

  /**
   * Fired when validation fails
   */
  VALIDATION_ERROR = 'validation:error',

  /**
   * Fired when a plugin is registered
   */
  PLUGIN_REGISTERED = 'plugin:registered',

  /**
   * Fired when a plugin is unregistered
   */
  PLUGIN_UNREGISTERED = 'plugin:unregistered',

  /**
   * Fired when a plugin execution starts
   */
  PLUGIN_EXECUTE_START = 'plugin:execute:start',

  /**
   * Fired when a plugin execution completes
   */
  PLUGIN_EXECUTE_COMPLETE = 'plugin:execute:complete',

  /**
   * Fired when a hook is registered
   */
  HOOK_REGISTERED = 'hook:registered',

  /**
   * Fired when a hook is unregistered
   */
  HOOK_UNREGISTERED = 'hook:unregistered',

  /**
   * Fired when a hook execution starts
   */
  HOOK_EXECUTE_START = 'hook:execute:start',

  /**
   * Fired when a hook execution completes
   */
  HOOK_EXECUTE_COMPLETE = 'hook:execute:complete',

  /**
   * Fired when a strategy is registered
   */
  STRATEGY_REGISTERED = 'strategy:registered',

  /**
   * Fired when a strategy is unregistered
   */
  STRATEGY_UNREGISTERED = 'strategy:unregistered',

  /**
   * Fired when configuration changes
   */
  CONFIG_CHANGED = 'config:changed',

  /**
   * Fired when versioning is enabled/disabled
   */
  VERSIONING_TOGGLED = 'versioning:toggled',
}

export interface SerializationEventData {
  eventType: SerializationEventType;
  timestamp: Date;
  data?: unknown;
  error?: Error;
  metadata?: Record<string, unknown>;
}
