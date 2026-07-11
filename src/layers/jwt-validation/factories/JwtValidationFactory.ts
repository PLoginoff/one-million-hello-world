import { JwtValidation } from '../implementations/JwtValidation';
import { DefaultJwtValidationStrategy, OptimizedJwtValidationStrategy } from '../strategies/JwtValidationStrategy';

export class JwtValidationFactory {
  static createDefault(): JwtValidation {
    const instance = new JwtValidation();
    instance.configure({ strategy: new DefaultJwtValidationStrategy() });
    return instance;
  }

  static createOptimized(): JwtValidation {
    const instance = new JwtValidation();
    instance.configure({ strategy: new OptimizedJwtValidationStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): JwtValidation {
    const instance = new JwtValidation();
    instance.configure(config);
    return instance;
  }
}
