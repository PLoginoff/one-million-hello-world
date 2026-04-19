/**
 * Hook Manager
 * 
 * Manages serialization hooks for extensibility.
 */

import {
  HookType,
  HookContext,
  HookFunction,
  ErrorHookFunction,
  SerializationHook,
} from './SerializationHook';

export class HookManager {
  private _hooks: Map<HookType, Array<{ hook: SerializationHook; priority: number }>> = new Map();
  private _enabled: boolean = true;

  /**
   * Registers a hook
   * 
   * @param hook - Hook to register
   */
  registerHook(hook: SerializationHook): void {
    if (!this._hooks.has(hook.type)) {
      this._hooks.set(hook.type, []);
    }

    const hooks = this._hooks.get(hook.type)!;
    hooks.push({
      hook,
      priority: hook.priority ?? 100,
    });

    hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregisters a hook by name
   * 
   * @param type - Hook type
   * @param name - Hook name
   */
  unregisterHook(type: HookType, name: string): void {
    const hooks = this._hooks.get(type);
    if (!hooks) return;

    const index = hooks.findIndex((h) => h.hook.name === name);
    if (index > -1) {
      hooks.splice(index, 1);
    }
  }

  /**
   * Executes hooks of a specific type
   * 
   * @param type - Hook type
   * @param data - Data to process
   * @param context - Hook context
   * @returns Processed data
   */
  async executeHook<T>(type: HookType, data: T, context: HookContext): Promise<T> {
    if (!this._enabled) {
      return data;
    }

    const hooks = this._hooks.get(type);
    if (!hooks) {
      return data;
    }

    let processed = data;
    for (const { hook } of hooks) {
      processed = await (hook.fn as HookFunction<T>)(processed, context);
    }
    return processed;
  }

  /**
   * Executes error hooks
   * 
   * @param error - Error to handle
   * @param context - Hook context
   */
  async executeErrorHooks(error: Error, context: HookContext): Promise<void> {
    if (!this._enabled) {
      return;
    }

    const hooks = this._hooks.get(HookType.ON_ERROR);
    if (!hooks) {
      return;
    }

    for (const { hook } of hooks) {
      await (hook.fn as ErrorHookFunction)(error, context);
    }
  }

  /**
   * Enables or disables hooks
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if hooks are enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets all hooks of a specific type
   * 
   * @param type - Hook type
   * @returns Array of hooks
   */
  getHooks(type: HookType): SerializationHook[] {
    return this._hooks.get(type)?.map((h) => h.hook) ?? [];
  }

  /**
   * Clears all hooks
   */
  clear(): void {
    this._hooks.clear();
  }

  /**
   * Clears hooks of a specific type
   * 
   * @param type - Hook type
   */
  clearType(type: HookType): void {
    this._hooks.delete(type);
  }
}
