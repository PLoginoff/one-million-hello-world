/**
 * Plugin Factory Interface
 * 
 * Defines the contract for creating plugins.
 */

import { ISerializationPlugin } from '../plugins/ISerializationPlugin';

export interface IPluginFactory {
  /**
   * Creates a plugin by name
   * 
   * @param name - Plugin name
   * @param config - Optional configuration
   * @returns Plugin instance
   * @throws Error if plugin is not found
   */
  createPlugin(name: string, config?: Record<string, unknown>): ISerializationPlugin;

  /**
   * Registers a plugin
   * 
   * @param name - Plugin name
   * @param factory - Plugin factory function
   */
  registerPlugin(name: string, factory: (config?: Record<string, unknown>) => ISerializationPlugin): void;

  /**
   * Checks if a plugin is registered
   * 
   * @param name - Plugin name
   * @returns True if registered
   */
  hasPlugin(name: string): boolean;

  /**
   * Gets all registered plugin names
   * 
   * @returns Array of plugin names
   */
  getPluginNames(): string[];
}
