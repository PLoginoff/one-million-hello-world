import { Websocket } from '../implementations/Websocket';
import { DefaultWebsocketStrategy, OptimizedWebsocketStrategy } from '../strategies/WebsocketStrategy';

export class WebsocketFactory {
  static createDefault(): Websocket {
    const instance = new Websocket();
    instance.configure({ strategy: new DefaultWebsocketStrategy() });
    return instance;
  }

  static createOptimized(): Websocket {
    const instance = new Websocket();
    instance.configure({ strategy: new OptimizedWebsocketStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Websocket {
    const instance = new Websocket();
    instance.configure(config);
    return instance;
  }
}
