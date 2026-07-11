import { Oauth2 } from '../implementations/Oauth2';
import { DefaultOauth2Strategy, OptimizedOauth2Strategy } from '../strategies/Oauth2Strategy';

export class Oauth2Factory {
  static createDefault(): Oauth2 {
    const instance = new Oauth2();
    instance.configure({ strategy: new DefaultOauth2Strategy() });
    return instance;
  }

  static createOptimized(): Oauth2 {
    const instance = new Oauth2();
    instance.configure({ strategy: new OptimizedOauth2Strategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Oauth2 {
    const instance = new Oauth2();
    instance.configure(config);
    return instance;
  }
}
