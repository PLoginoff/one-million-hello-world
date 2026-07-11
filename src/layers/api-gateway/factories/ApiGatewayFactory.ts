import { ApiGateway } from '../implementations/ApiGateway';
import { DefaultApiGatewayStrategy, OptimizedApiGatewayStrategy } from '../strategies/ApiGatewayStrategy';

export class ApiGatewayFactory {
  static createDefault(): ApiGateway {
    const instance = new ApiGateway();
    instance.configure({ strategy: new DefaultApiGatewayStrategy() });
    return instance;
  }

  static createOptimized(): ApiGateway {
    const instance = new ApiGateway();
    instance.configure({ strategy: new OptimizedApiGatewayStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ApiGateway {
    const instance = new ApiGateway();
    instance.configure(config);
    return instance;
  }
}
