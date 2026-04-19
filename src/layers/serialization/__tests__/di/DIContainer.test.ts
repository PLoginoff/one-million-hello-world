/**
 * DI Container Tests
 */

import { DIContainer, ServiceLifetime } from '../../di';
import { ServiceDescriptor } from '../../di/ServiceDescriptor';

class TestService {
  constructor(public value: string = 'test') {}
}

class DependentService {
  constructor(public dependency: TestService) {}
}

describe('DIContainer', () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  describe('Singleton Services', () => {
    it('should register singleton service', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      expect(container.isRegistered(TestService)).toBe(true);
    });

    it('should return same instance for singleton', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      const instance1 = container.resolve(TestService);
      const instance2 = container.resolve(TestService);
      expect(instance1).toBe(instance2);
    });

    it('should resolve singleton with factory', () => {
      container.register(TestService, ServiceLifetime.Singleton, () => new TestService('custom'));
      const instance = container.resolve(TestService);
      expect(instance.value).toBe('custom');
    });
  });

  describe('Transient Services', () => {
    it('should register transient service', () => {
      container.register(TestService, ServiceLifetime.Transient);
      expect(container.isRegistered(TestService)).toBe(true);
    });

    it('should return different instances for transient', () => {
      container.register(TestService, ServiceLifetime.Transient);
      const instance1 = container.resolve(TestService);
      const instance2 = container.resolve(TestService);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Scoped Services', () => {
    it('should register scoped service', () => {
      container.register(TestService, ServiceLifetime.Scoped);
      expect(container.isRegistered(TestService)).toBe(true);
    });

    it('should return same instance within scope', () => {
      container.register(TestService, ServiceLifetime.Scoped);
      const scope = container.createScope();
      const instance1 = scope.resolve(TestService);
      const instance2 = scope.resolve(TestService);
      expect(instance1).toBe(instance2);
    });

    it('should return different instances across scopes', () => {
      container.register(TestService, ServiceLifetime.Scoped);
      const scope1 = container.createScope();
      const scope2 = container.createScope();
      const instance1 = scope1.resolve(TestService);
      const instance2 = scope2.resolve(TestService);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Dependency Injection', () => {
    it('should resolve dependencies automatically', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      container.register(DependentService, ServiceLifetime.Transient);
      const instance = container.resolve(DependentService);
      expect(instance).toBeInstanceOf(DependentService);
      expect(instance.dependency).toBeInstanceOf(TestService);
    });
  });

  describe('Service Lifecycle', () => {
    it('should unregister service', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      container.unregister(TestService);
      expect(container.isRegistered(TestService)).toBe(false);
    });

    it('should clear all services', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      container.register(DependentService, ServiceLifetime.Transient);
      container.clear();
      expect(container.isRegistered(TestService)).toBe(false);
      expect(container.isRegistered(DependentService)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw when resolving unregistered service', () => {
      expect(() => container.resolve(TestService)).toThrow();
    });

    it('should throw when registering already registered service', () => {
      container.register(TestService, ServiceLifetime.Singleton);
      expect(() => container.register(TestService, ServiceLifetime.Singleton)).toThrow();
    });
  });
});
