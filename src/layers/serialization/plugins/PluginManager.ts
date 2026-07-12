/**
 * Plugin Manager
 *
 * Manages serialization plugins lifecycle and execution.
 */

import { ISerializationPlugin } from './ISerializationPlugin';

export class PluginManager {
  private _plugins: Map<string, ISerializationPlugin> = new Map();
  private _enabled: boolean = true;

  /**
   * Registers a plugin
   *
   * @param plugin - Plugin to register
   */
  async registerPlugin(plugin: ISerializationPlugin): Promise<void> {
    const existing = this._plugins.get(plugin.name);
    if (existing?.cleanup) {
      await existing.cleanup();
    }

    if (plugin.initialize) {
      await plugin.initialize();
    }

    this._plugins.set(plugin.name, plugin);
  }

  /**
   * Unregisters a plugin
   *
   * @param name - Plugin name
   */
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this._plugins.get(name);
    if (!plugin) {
      return;
    }

    if (plugin.cleanup) {
      await plugin.cleanup();
    }

    this._plugins.delete(name);
  }

  /**
   * Gets a plugin by name
   *
   * @param name - Plugin name
   * @returns Plugin or undefined
   */
  getPlugin(name: string): ISerializationPlugin | undefined {
    return this._plugins.get(name);
  }

  /**
   * Gets all registered plugins
   *
   * @returns Array of plugins
   */
  getAllPlugins(): ISerializationPlugin[] {
    return Array.from(this._plugins.values());
  }

  /**
   * Gets all registered plugins (alias for getAllPlugins)
   *
   * @returns Array of plugins
   */
  getPlugins(): ISerializationPlugin[] {
    return this.getAllPlugins();
  }

  /**
   * Clears all plugins (alias for clear)
   */
  clearPlugins(): Promise<void> {
    return this.clear();
  }

  /**
   * Enables or disables plugins
   *
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if plugins are enabled
   *
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Executes beforeSerialize hooks for all plugins
   *
   * @param data - Data to process
   * @returns Processed data
   */
  async executeBeforeSerialize(data: unknown): Promise<unknown> {
    if (!this._enabled) {
      return data;
    }

    let processed = data;
    for (const plugin of this._plugins.values()) {
      if (plugin.beforeSerialize) {
        processed = await plugin.beforeSerialize(processed);
      }
    }
    return processed;
  }

  /**
   * Executes afterSerialize hooks for all plugins
   *
   * @param serialized - Serialized data to process
   * @returns Processed data
   */
  async executeAfterSerialize(serialized: string): Promise<string> {
    if (!this._enabled) {
      return serialized;
    }

    let processed = serialized;
    for (const plugin of this._plugins.values()) {
      if (plugin.afterSerialize) {
        processed = await plugin.afterSerialize(processed);
      }
    }
    return processed;
  }

  /**
   * Executes beforeDeserialize hooks for all plugins
   *
   * @param data - Data to process
   * @returns Processed data
   */
  async executeBeforeDeserialize(data: string): Promise<string> {
    if (!this._enabled) {
      return data;
    }

    let processed = data;
    for (const plugin of this._plugins.values()) {
      if (plugin.beforeDeserialize) {
        processed = await plugin.beforeDeserialize(processed);
      }
    }
    return processed;
  }

  /**
   * Executes afterDeserialize hooks for all plugins
   *
   * @param deserialized - Deserialized data to process
   * @returns Processed data
   */
  async executeAfterDeserialize(deserialized: unknown): Promise<unknown> {
    if (!this._enabled) {
      return deserialized;
    }

    let processed = deserialized;
    for (const plugin of this._plugins.values()) {
      if (plugin.afterDeserialize) {
        processed = await plugin.afterDeserialize(processed);
      }
    }
    return processed;
  }

  /**
   * Clears all plugins
   */
  async clear(): Promise<void> {
    for (const plugin of this._plugins.values()) {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
    }
    this._plugins.clear();
  }
}
