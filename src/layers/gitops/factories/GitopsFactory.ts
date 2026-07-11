import { Gitops } from '../implementations/Gitops';
import { DefaultGitopsStrategy, OptimizedGitopsStrategy } from '../strategies/GitopsStrategy';

export class GitopsFactory {
  static createDefault(): Gitops {
    const instance = new Gitops();
    instance.configure({ strategy: new DefaultGitopsStrategy() });
    return instance;
  }

  static createOptimized(): Gitops {
    const instance = new Gitops();
    instance.configure({ strategy: new OptimizedGitopsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Gitops {
    const instance = new Gitops();
    instance.configure(config);
    return instance;
  }
}
