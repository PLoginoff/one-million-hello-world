import { EdgeCache } from '../implementations/EdgeCache';
import { DefaultEdgeCacheStrategy, OptimizedEdgeCacheStrategy } from '../strategies/EdgeCacheStrategy';

export class EdgeCacheFactory {
  static createDefault(): EdgeCache {
    const instance = new EdgeCache();
    instance.configure({ strategy: new DefaultEdgeCacheStrategy() });
    return instance;
  }

  static createOptimized(): EdgeCache {
    const instance = new EdgeCache();
    instance.configure({ strategy: new OptimizedEdgeCacheStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): EdgeCache {
    const instance = new EdgeCache();
    instance.configure(config);
    return instance;
  }
}
