/**
 * Websocket Value Object
 *
 * Immutable value object for the WebSocket connection and message framing layer.
 */

export class WebsocketValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Websocket value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): WebsocketValueObject {
    return new WebsocketValueObject(value);
  }

  equals(other: WebsocketValueObject): boolean {
    return other instanceof WebsocketValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
