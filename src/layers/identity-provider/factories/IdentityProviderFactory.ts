import { IdentityProvider } from '../implementations/IdentityProvider';
import {
  DefaultIdentityProviderStrategy,
  OptimizedIdentityProviderStrategy,
} from '../strategies/IdentityProviderStrategy';

export class IdentityProviderFactory {
  static createDefault(): IdentityProvider {
    const instance = new IdentityProvider();
    instance.configure({ strategy: new DefaultIdentityProviderStrategy() });
    return instance;
  }

  static createOptimized(): IdentityProvider {
    const instance = new IdentityProvider();
    instance.configure({ strategy: new OptimizedIdentityProviderStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): IdentityProvider {
    const instance = new IdentityProvider();
    instance.configure(config);
    return instance;
  }
}
