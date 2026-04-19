/**
 * Plugin Registry
 * 
 * Central registry for serialization plugins with metadata.
 */

import { ISerializationPlugin } from '../plugins/ISerializationPlugin';

export interface PluginMetadata {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  category?: string;
  tags?: string[];
  enabled?: boolean;
  priority?: number;
}

export class PluginRegistry {
  private _plugins: Map<string, { plugin: ISerializationPlugin; metadata: PluginMetadata }>;
  private _categoryMap: Map<string, string[]>;
  private _nameMap: Map<string, string>;

  constructor() {
    this._plugins = new Map();
    this._categoryMap = new Map();
    this._nameMap = new Map();
  }

  /**
   * Registers a plugin with metadata
   * 
   * @param key - Unique key for the plugin
   * @param plugin - Plugin instance
   * @param metadata - Plugin metadata
   */
  register(key: string, plugin: ISerializationPlugin, metadata: PluginMetadata): void {
    this._plugins.set(key, { plugin, metadata });
    this._nameMap.set(metadata.name, key);

    if (metadata.category) {
      const categoryPlugins = this._categoryMap.get(metadata.category) ?? [];
      if (!categoryPlugins.includes(key)) {
        categoryPlugins.push(key);
      }
      this._categoryMap.set(metadata.category, categoryPlugins);
    }
  }

  /**
   * Unregisters a plugin
   * 
   * @param key - Plugin key
   */
  unregister(key: string): void {
    const entry = this._plugins.get(key);
    if (entry) {
      this._nameMap.delete(entry.metadata.name);

      if (entry.metadata.category) {
        const categoryPlugins = this._categoryMap.get(entry.metadata.category) ?? [];
        const index = categoryPlugins.indexOf(key);
        if (index > -1) {
          categoryPlugins.splice(index, 1);
        }
      }
    }
    this._plugins.delete(key);
  }

  /**
   * Gets a plugin by key
   * 
   * @param key - Plugin key
   * @returns Plugin or undefined
   */
  get(key: string): ISerializationPlugin | undefined {
    return this._plugins.get(key)?.plugin;
  }

  /**
   * Gets a plugin by name
   * 
   * @param name - Plugin name
   * @returns Plugin or undefined
   */
  getByName(name: string): ISerializationPlugin | undefined {
    const key = this._nameMap.get(name);
    return key ? this.get(key) : undefined;
  }

  /**
   * Gets plugin metadata by key
   * 
   * @param key - Plugin key
   * @returns Metadata or undefined
   */
  getMetadata(key: string): PluginMetadata | undefined {
    return this._plugins.get(key)?.metadata;
  }

  /**
   * Gets all registered plugins
   * 
   * @returns Array of plugins with metadata
   */
  getAll(): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    return Array.from(this._plugins.entries()).map(([key, entry]) => ({
      key,
      plugin: entry.plugin,
      metadata: entry.metadata,
    }));
  }

  /**
   * Gets plugins by category
   * 
   * @param category - Category name
   * @returns Array of matching plugins
   */
  getByCategory(category: string): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    const keys = this._categoryMap.get(category) ?? [];
    return keys.map(key => ({
      key,
      plugin: this.get(key)!,
      metadata: this.getMetadata(key)!,
    }));
  }

  /**
   * Gets plugins by tag
   * 
   * @param tag - Tag to filter by
   * @returns Array of matching plugins
   */
  getByTag(tag: string): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    return this.getAll().filter(entry => entry.metadata.tags?.includes(tag));
  }

  /**
   * Gets enabled plugins
   * 
   * @returns Array of enabled plugins
   */
  getEnabled(): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    return this.getAll().filter(entry => entry.metadata.enabled !== false);
  }

  /**
   * Gets disabled plugins
   * 
   * @returns Array of disabled plugins
   */
  getDisabled(): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    return this.getAll().filter(entry => entry.metadata.enabled === false);
  }

  /**
   * Gets plugins by priority (highest first)
   * 
   * @returns Array of plugins sorted by priority
   */
  getByPriority(): Array<{ key: string; plugin: ISerializationPlugin; metadata: PluginMetadata }> {
    return this.getAll().sort((a, b) => {
      const aPriority = a.metadata.priority ?? 0;
      const bPriority = b.metadata.priority ?? 0;
      return bPriority - aPriority;
    });
  }

  /**
   * Checks if a plugin is registered
   * 
   * @param key - Plugin key
   * @returns True if registered
   */
  has(key: string): boolean {
    return this._plugins.has(key);
  }

  /**
   * Checks if a plugin name is registered
   * 
   * @param name - Plugin name
   * @returns True if registered
   */
  hasName(name: string): boolean {
    return this._nameMap.has(name);
  }

  /**
   * Enables a plugin
   * 
   * @param key - Plugin key
   */
  enable(key: string): void {
    const entry = this._plugins.get(key);
    if (entry) {
      entry.metadata.enabled = true;
    }
  }

  /**
   * Disables a plugin
   * 
   * @param key - Plugin key
   */
  disable(key: string): void {
    const entry = this._plugins.get(key);
    if (entry) {
      entry.metadata.enabled = false;
    }
  }

  /**
   * Gets all categories
   * 
   * @returns Array of category names
   */
  getCategories(): string[] {
    return Array.from(this._categoryMap.keys());
  }

  /**
   * Clears all registered plugins
   */
  clear(): void {
    this._plugins.clear();
    this._categoryMap.clear();
    this._nameMap.clear();
  }

  /**
   * Gets the number of registered plugins
   * 
   * @returns Number of plugins
   */
  size(): number {
    return this._plugins.size;
  }
}
