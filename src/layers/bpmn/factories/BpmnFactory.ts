import { Bpmn } from '../implementations/Bpmn';
import { DefaultBpmnStrategy, OptimizedBpmnStrategy } from '../strategies/BpmnStrategy';

export class BpmnFactory {
  static createDefault(): Bpmn {
    const instance = new Bpmn();
    instance.configure({ strategy: new DefaultBpmnStrategy() });
    return instance;
  }

  static createOptimized(): Bpmn {
    const instance = new Bpmn();
    instance.configure({ strategy: new OptimizedBpmnStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Bpmn {
    const instance = new Bpmn();
    instance.configure(config);
    return instance;
  }
}
