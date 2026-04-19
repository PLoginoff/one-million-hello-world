/**
 * Connection State Value Object
 * 
 * Represents the state of a network connection with state transitions.
 */

export enum ConnectionStateEnum {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  CLOSING = 'CLOSING',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING',
  PAUSED = 'PAUSED',
  TIMEOUT = 'TIMEOUT',
}

export class ConnectionState {
  readonly value: ConnectionStateEnum;
  readonly timestamp: number;
  readonly previousState: ConnectionStateEnum | null;

  private constructor(
    value: ConnectionStateEnum,
    timestamp: number,
    previousState: ConnectionStateEnum | null,
  ) {
    this.value = value;
    this.timestamp = timestamp;
    this.previousState = previousState;
  }

  /**
   * Create initial disconnected state
   */
  static initial(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.DISCONNECTED, Date.now(), null);
  }

  /**
   * Create state from enum
   */
  static from(value: ConnectionStateEnum): ConnectionState {
    return new ConnectionState(value, Date.now(), null);
  }

  /**
   * Create state with previous state
   */
  static transition(
    from: ConnectionState,
    to: ConnectionStateEnum,
  ): ConnectionState {
    return new ConnectionState(to, Date.now(), from.value);
  }

  /**
   * Transition to connecting
   */
  toConnecting(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.CONNECTING, Date.now(), this.value);
  }

  /**
   * Transition to connected
   */
  toConnected(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.CONNECTED, Date.now(), this.value);
  }

  /**
   * Transition to closing
   */
  toClosing(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.CLOSING, Date.now(), this.value);
  }

  /**
   * Transition to disconnected
   */
  toDisconnected(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.DISCONNECTED, Date.now(), this.value);
  }

  /**
   * Transition to error
   */
  toError(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.ERROR, Date.now(), this.value);
  }

  /**
   * Transition to reconnecting
   */
  toReconnecting(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.RECONNECTING, Date.now(), this.value);
  }

  /**
   * Transition to paused
   */
  toPaused(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.PAUSED, Date.now(), this.value);
  }

  /**
   * Transition to timeout
   */
  toTimeout(): ConnectionState {
    return new ConnectionState(ConnectionStateEnum.TIMEOUT, Date.now(), this.value);
  }

  /**
   * Check if can transition to target state
   */
  canTransitionTo(target: ConnectionStateEnum): boolean {
    const validTransitions: Map<ConnectionStateEnum, ConnectionStateEnum[]> = new Map([
      [ConnectionStateEnum.DISCONNECTED, [ConnectionStateEnum.CONNECTING, ConnectionStateEnum.RECONNECTING]],
      [ConnectionStateEnum.CONNECTING, [ConnectionStateEnum.CONNECTED, ConnectionStateEnum.ERROR, ConnectionStateEnum.TIMEOUT]],
      [ConnectionStateEnum.CONNECTED, [ConnectionStateEnum.CLOSING, ConnectionStateEnum.PAUSED, ConnectionStateEnum.ERROR]],
      [ConnectionStateEnum.CLOSING, [ConnectionStateEnum.DISCONNECTED]],
      [ConnectionStateEnum.ERROR, [ConnectionStateEnum.RECONNECTING, ConnectionStateEnum.DISCONNECTED]],
      [ConnectionStateEnum.RECONNECTING, [ConnectionStateEnum.CONNECTED, ConnectionStateEnum.ERROR]],
      [ConnectionStateEnum.PAUSED, [ConnectionStateEnum.CONNECTED, ConnectionStateEnum.CLOSING]],
      [ConnectionStateEnum.TIMEOUT, [ConnectionStateEnum.RECONNECTING, ConnectionStateEnum.DISCONNECTED]],
    ]);

    const allowed = validTransitions.get(this.value);
    return allowed ? allowed.includes(target) : false;
  }

  /**
   * Check if is active (connected or connecting)
   */
  isActive(): boolean {
    return this.value === ConnectionStateEnum.CONNECTED || 
           this.value === ConnectionStateEnum.CONNECTING;
  }

  /**
   * Check if is disconnected
   */
  isDisconnected(): boolean {
    return this.value === ConnectionStateEnum.DISCONNECTED;
  }

  /**
   * Check if is error state
   */
  isError(): boolean {
    return this.value === ConnectionStateEnum.ERROR;
  }

  /**
   * Check if is terminal state
   */
  isTerminal(): boolean {
    return this.value === ConnectionStateEnum.DISCONNECTED || 
           this.value === ConnectionStateEnum.ERROR;
  }

  /**
   * Get age of state in milliseconds
   */
  getAge(): number {
    return Date.now() - this.timestamp;
  }

  /**
   * Check if equals another state
   */
  equals(other: ConnectionState): boolean {
    return this.value === other.value;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }
}
