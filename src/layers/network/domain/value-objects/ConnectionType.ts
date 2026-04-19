/**
 * Connection Type Value Object
 * 
 * Represents the type of network connection protocol.
 */

export enum ConnectionTypeEnum {
  TCP = 'TCP',
  UDP = 'UDP',
  TLS = 'TLS',
  WEBSOCKET = 'WEBSOCKET',
}

export class ConnectionType {
  readonly value: ConnectionTypeEnum;
  readonly isReliable: boolean;
  readonly isSecure: boolean;
  readonly defaultPort: number;

  private constructor(
    value: ConnectionTypeEnum,
    isReliable: boolean,
    isSecure: boolean,
    defaultPort: number,
  ) {
    this.value = value;
    this.isReliable = isReliable;
    this.isSecure = isSecure;
    this.defaultPort = defaultPort;
  }

  /**
   * Create TCP connection type
   */
  static tcp(): ConnectionType {
    return new ConnectionType(ConnectionTypeEnum.TCP, true, false, 80);
  }

  /**
   * Create UDP connection type
   */
  static udp(): ConnectionType {
    return new ConnectionType(ConnectionTypeEnum.UDP, false, false, 53);
  }

  /**
   * Create TLS connection type
   */
  static tls(): ConnectionType {
    return new ConnectionType(ConnectionTypeEnum.TLS, true, true, 443);
  }

  /**
   * Create WebSocket connection type
   */
  static websocket(): ConnectionType {
    return new ConnectionType(ConnectionTypeEnum.WEBSOCKET, true, false, 80);
  }

  /**
   * Create from enum
   */
  static from(value: ConnectionTypeEnum): ConnectionType {
    switch (value) {
      case ConnectionTypeEnum.TCP:
        return ConnectionType.tcp();
      case ConnectionTypeEnum.UDP:
        return ConnectionType.udp();
      case ConnectionTypeEnum.TLS:
        return ConnectionType.tls();
      case ConnectionTypeEnum.WEBSOCKET:
        return ConnectionType.websocket();
      default:
        return ConnectionType.tcp();
    }
  }

  /**
   * Create from string
   */
  static fromString(value: string): ConnectionType {
    const upperValue = value.toUpperCase();
    switch (upperValue) {
      case 'TCP':
        return ConnectionType.tcp();
      case 'UDP':
        return ConnectionType.udp();
      case 'TLS':
        return ConnectionType.tls();
      case 'WEBSOCKET':
      case 'WS':
        return ConnectionType.websocket();
      default:
        return ConnectionType.tcp();
    }
  }

  /**
   * Check if is TCP
   */
  isTcp(): boolean {
    return this.value === ConnectionTypeEnum.TCP;
  }

  /**
   * Check if is UDP
   */
  isUdp(): boolean {
    return this.value === ConnectionTypeEnum.UDP;
  }

  /**
   * Check if is TLS
   */
  isTls(): boolean {
    return this.value === ConnectionTypeEnum.TLS;
  }

  /**
   * Check if is WebSocket
   */
  isWebsocket(): boolean {
    return this.value === ConnectionTypeEnum.WEBSOCKET;
  }

  /**
   * Check if is reliable (guaranteed delivery)
   */
  isReliableConnection(): boolean {
    return this.isReliable;
  }

  /**
   * Check if is secure (encrypted)
   */
  isSecureConnection(): boolean {
    return this.isSecure;
  }

  /**
   * Check if equals another type
   */
  equals(other: ConnectionType): boolean {
    return this.value === other.value;
  }

  /**
   * Get default port for this connection type
   */
  getDefaultPort(): number {
    return this.defaultPort;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Get lowercase string representation
   */
  toLowerCase(): string {
    return this.value.toLowerCase();
  }
}
