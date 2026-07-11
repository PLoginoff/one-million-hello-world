import { WorkflowEngine } from '../implementations/WorkflowEngine';
import { DefaultWorkflowEngineStrategy, OptimizedWorkflowEngineStrategy } from '../strategies/WorkflowEngineStrategy';

export class WorkflowEngineFactory {
  static createDefault(): WorkflowEngine {
    const instance = new WorkflowEngine();
    instance.configure({ strategy: new DefaultWorkflowEngineStrategy() });
    return instance;
  }

  static createOptimized(): WorkflowEngine {
    const instance = new WorkflowEngine();
    instance.configure({ strategy: new OptimizedWorkflowEngineStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): WorkflowEngine {
    const instance = new WorkflowEngine();
    instance.configure(config);
    return instance;
  }
}
