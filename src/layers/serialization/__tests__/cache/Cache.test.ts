/**
 * Cache Tests
 */

import { InMemoryCacheProvider, LRUCacheProvider, CacheManager } from '../../cache';

describe('InMemoryCacheProvider', () => {
  let provider: InMemoryCacheProvider;

  beforeEach(() => {
    provider = new InMemoryCacheProvider();
  });

  describe('Basic Operations', () => {
    it('should set and get value', () => {
      provider.set('key', 'value');
      expect(provider.get('key')).toBe('value');
    });

    it('should return undefined for non-existent key', () => {
      expect(provider.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      provider.set('key', 'value');
      expect(provider.has('key')).toBe(true);
      expect(provider.has('nonexistent')).toBe(false);
    });

    it('should delete key', () => {
      provider.set('key', 'value');
      provider.delete('key');
      expect(provider.has('key')).toBe(false);
    });

    it('should clear all entries', () => {
      provider.set('key1', 'value1');
      provider.set('key2', 'value2');
      provider.clear();
      expect(provider.size()).toBe(0);
    });
  });

  describe('TTL', () => {
    it('should expire entries', (done) => {
      provider.set('key', 'value', 100);
      setTimeout(() => {
        expect(provider.get('key')).toBeUndefined();
        done();
      }, 150);
    });

    it('should not expire before TTL', () => {
      provider.set('key', 'value', 1000);
      expect(provider.get('key')).toBe('value');
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      provider.set('key1', 'value1');
      provider.set('key2', 'value2');
      provider.get('key1');
      provider.get('key1');
      const stats = provider.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hitCount).toBe(2);
    });
  });
});

describe('LRUCacheProvider', () => {
  let provider: LRUCacheProvider;

  beforeEach(() => {
    provider = new LRUCacheProvider(3);
  });

  it('should evict least recently used', () => {
    provider.set('key1', 'value1');
    provider.set('key2', 'value2');
    provider.set('key3', 'value3');
    provider.get('key1');
    provider.set('key4', 'value4');
    expect(provider.has('key1')).toBe(true);
    expect(provider.has('key2')).toBe(false);
  });

  it('should maintain access order', () => {
    provider.set('key1', 'value1');
    provider.set('key2', 'value2');
    provider.get('key1');
    const order = provider.getAccessOrder();
    expect(order[order.length - 1]).toBe('key1');
  });
});

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  it('should get or create provider', () => {
    const provider = manager.getOrCreateProvider('default');
    expect(provider).toBeDefined();
  });

  it('should share provider for same namespace', () => {
    const provider1 = manager.getOrCreateProvider('test');
    const provider2 = manager.getOrCreateProvider('test');
    expect(provider1).toBe(provider2);
  });

  it('should set value in namespace', () => {
    manager.set('test', 'key', 'value');
    expect(manager.get('test', 'key')).toBe('value');
  });

  it('should clear namespace', () => {
    manager.set('test', 'key1', 'value1');
    manager.set('test', 'key2', 'value2');
    manager.clearNamespace('test');
    expect(manager.get('test', 'key1')).toBeUndefined();
  });

  it('should clear all namespaces', () => {
    manager.set('ns1', 'key', 'value1');
    manager.set('ns2', 'key', 'value2');
    manager.clearAll();
    expect(manager.get('ns1', 'key')).toBeUndefined();
    expect(manager.get('ns2', 'key')).toBeUndefined();
  });
});
