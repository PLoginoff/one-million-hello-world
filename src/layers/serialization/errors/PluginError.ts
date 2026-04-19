/**
 * Plugin Error
 * 
 * Error thrown when plugin operation fails.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class PluginError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('PLUGIN_ERROR', message, context, cause);
  }

  /**
   * Creates error for plugin not found
   */
  static pluginNotFound(name: string): PluginError {
    return new PluginError(
      `Plugin not found: ${name}`,
      { name }
    );
  }

  /**
   * Creates error for plugin already registered
   */
  static pluginAlreadyRegistered(name: string): PluginError {
    return new PluginError(
      `Plugin already registered: ${name}`,
      { name }
    );
  }

  /**
   * Creates error for plugin execution failure
   */
  static pluginExecutionFailed(name: string, phase: string, cause?: Error): PluginError {
    return new PluginError(
      `Plugin execution failed: ${name} in phase ${phase}`,
      { name, phase },
      cause
    );
  }

  /**
   * Creates error for plugin initialization failure
   */
  static pluginInitializationFailed(name: string, cause?: Error): PluginError {
    return new PluginError(
      `Plugin initialization failed: ${name}`,
      { name },
      cause
    );
  }

  /**
   * Creates error for plugin cleanup failure
   */
  static pluginCleanupFailed(name: string, cause?: Error): PluginError {
    return new PluginError(
      `Plugin cleanup failed: ${name}`,
      { name },
      cause
    );
  }
}
