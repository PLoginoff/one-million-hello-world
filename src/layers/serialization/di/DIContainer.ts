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
    lifetime: ServiceLifetime,
    factory?: () => T,
    dependencies?: unknown[]
  ): void {
    if (this._services.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`);
    }

    const resolvedFactory = factory ?? (() => this._createConstructorInstance<T>(token, dependencies ?? []));
    const descriptor = createServiceDescriptor(token, resolvedFactory, lifetime, dependencies);
    this._services.set(token, descriptor);
  }

  private _createConstructorInstance<T>(constructor: unknown, dependencies: unknown[]): T {
    const deps = dependencies.map(dep => this.resolve(dep));
    const Ctor = constructor as new (...args: unknown[]) => T;
    return new Ctor(...deps);
  }

  resolve<T>(token: new (...args: unknown[]) => T): T;
  resolve<T>(token: unknown): T;
  resolve<T>(token: unknown): T {
    if (this._scoped.has(token)) {
      return this._scoped.get(token) as T;
    }

    const descriptor = this._services.get(token) ?? this._findDescriptorInParent(token);
    if (!descriptor) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
      return this._resolveSingleton<T>(descriptor, token);
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

  private _findDescriptorInParent(token: unknown): ServiceDescriptor | undefined {
    let parent = this._parent;
    while (parent) {
      if (parent instanceof DIContainer) {
        const descriptor = parent._services.get(token);
        if (descriptor) {
          return descriptor;
        }
        parent = parent._parent;
      } else {
        return undefined;
      }
    }
    return undefined;
  }

  private _resolveSingleton<T>(descriptor: ServiceDescriptor, token: unknown): T {
    let root: DIContainer = this;
    while (root._parent instanceof DIContainer) {
      root = root._parent;
    }
    if (root._singletons.has(token)) {
      return root._singletons.get(token) as T;
    }
    const instance = this._createInstance(descriptor);
    root._singletons.set(token, instance);
    return instance as T;
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
