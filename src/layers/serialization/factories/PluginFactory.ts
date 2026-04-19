/**
 * Plugin Factory
 * 
 * Factory for creating plugins.
 */

import { IPluginFactory } from './IPluginFactory';
import { ISerializationPlugin } from '../plugins/ISerializationPlugin';
import { CompressionPlugin } from '../plugins/CompressionPlugin';

export class PluginFactory implements IPluginFactory {
  private _plugins: Map<string, (config?: Record<string, unknown>) => ISerializationPlugin>;

  constructor() {
    this._plugins = new Map();
    this._registerDefaultPlugins();
  }

  createPlugin(name: string, config?: Record<string, unknown>): ISerializationPlugin {
    const factory = this._plugins.get(name);
    if (!factory) {
      throw new Error(`Plugin not found: ${name}`);
    }
    return factory(config);
  }

  registerPlugin(name: string, factory: (config?: Record<string, unknown>) => ISerializationPlugin): void {
    this._plugins.set(name, factory);
  }

  hasPlugin(name: string): boolean {
    return this._plugins.has(name);
  }

  getPluginNames(): string[] {
    return Array.from(this._plugins.keys());
  }

  /**
   * Unregisters a plugin
   * 
   * @param name - Plugin name
   */
  unregisterPlugin(name: string): void {
    this._plugins.delete(name);
  }

  /**
   * Clears all registered plugins
   */
  clearPlugins(): void {
    this._plugins.clear();
  }

  private _registerDefaultPlugins(): void {
    this._plugins.set('compression', (config?: Record<string, unknown>) => {
      const enabled = config?.enabled as boolean ?? true;
      return new CompressionPlugin(enabled);
    });
  }
}
