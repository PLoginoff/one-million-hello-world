/**
 * DI Container Implementation
 * 
 * Provides dependency injection capabilities for the serialization layer.
 */

import { IDIContainer } from './IDIContainer';
import { ServiceLifetime } from './ServiceLifetime';
import { createServiceDescriptor, ServiceDescriptor } from './ServiceDescriptor';

export class DIContainer implements IDIContainer {
  private _services: Map<unknown, ServiceDescriptor> = new Map();
  private _singletons: Map<unknown, unknown> = new Map();
  private _scoped: Map<unknown, unknown> = new Map();
  private _parent?: IDIContainer;
  private _children: Set<IDIContainer> = new Set();

  register<T>(
    token: unknown,
    factory: () => T,
    lifetime: ServiceLifetime = ServiceLifetime.TRANSIENT,
    dependencies?: unknown[]
  ): void {
    const descriptor = createServiceDescriptor(token, factory, lifetime, dependencies);
    this._services.set(token, descriptor);
  }

  resolve<T>(token: unknown): T {
    if (this._scoped.has(token)) {
      return this._scoped.get(token) as T;
    }

    const descriptor = this._services.get(token);
    if (!descriptor) {
      if (this._parent) {
        return this._parent.resolve<T>(token);
      }
      throw new Error(`Service not registered: ${String(token)}`);
    }

    if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
      if (this._singletons.has(token)) {
        return this._singletons.get(token) as T;
      }
      const instance = this._createInstance(descriptor);
      this._singletons.set(token, instance);
      return instance as T;
    }

    if (descriptor.lifetime === ServiceLifetime.SCOPED) {
      if (this._scoped.has(token)) {
        return this._scoped.get(token) as T;
      }
      const instance = this._createInstance(descriptor);
      this._scoped.set(token, instance);
      return instance as T;
    }

    return this._createInstance(descriptor) as T;
  }

  isRegistered(token: unknown): boolean {
    if (this._services.has(token)) {
      return true;
    }
    return this._parent?.isRegistered(token) ?? false;
  }

  unregister(token: unknown): void {
    this._services.delete(token);
    this._singletons.delete(token);
    this._scoped.delete(token);
  }

  clear(): void {
    this._services.clear();
    this._singletons.clear();
    this._scoped.clear();
    this._children.forEach(child => child.clear());
  }

  createScope(): IDIContainer {
    const scope = new DIContainer();
    scope._parent = this;
    this._children.add(scope);
    return scope;
  }

  getParent(): IDIContainer | undefined {
    return this._parent;
  }

  private _createInstance<T>(descriptor: ServiceDescriptor<T>): T {
    try {
      return descriptor.factory();
    } catch (error) {
      throw new Error(
        `Failed to create instance for ${String(descriptor.token)}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Disposes the container and all its resources
   */
  dispose(): void {
    this._singletons.clear();
    this._scoped.clear();
    this._children.forEach(child => {
      if (child instanceof DIContainer) {
        child.dispose();
      }
    });
    this._children.clear();
  }
}
