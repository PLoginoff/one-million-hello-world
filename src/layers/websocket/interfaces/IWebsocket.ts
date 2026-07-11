/**
 * Websocket Interface
 *
 * Defines the contract for the WebSocket connection and message framing layer.
 */

import { WebsocketResult, WebsocketContext } from '../types/websocket-types';

export interface IWebsocket {
  /**
   * Execute the websocket operation
   */
  execute(context: WebsocketContext): Promise<WebsocketResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
