import { ServiceMesh } from '../implementations/ServiceMesh';
import { DefaultServiceMeshStrategy, OptimizedServiceMeshStrategy } from '../strategies/ServiceMeshStrategy';

export class ServiceMeshFactory {
  static createDefault(): ServiceMesh {
    const instance = new ServiceMesh();
    instance.configure({ strategy: new DefaultServiceMeshStrategy() });
    return instance;
  }

  static createOptimized(): ServiceMesh {
    const instance = new ServiceMesh();
    instance.configure({ strategy: new OptimizedServiceMeshStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ServiceMesh {
    const instance = new ServiceMesh();
    instance.configure(config);
    return instance;
  }
}
