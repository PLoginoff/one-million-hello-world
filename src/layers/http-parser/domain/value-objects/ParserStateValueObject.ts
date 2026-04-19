/**
 * Parser State Value Object
 * 
 * Represents the current state of HTTP parser with state transitions.
 */

import { ParserState } from '../../types/http-parser-types';

export class ParserStateValueObject {
  readonly value: ParserState;
  readonly timestamp: Date;

  private constructor(value: ParserState) {
    this.value = value;
    this.timestamp = new Date();
  }

  /**
   * Create parser state value object
   */
  static create(value: ParserState): ParserStateValueObject {
    return new ParserStateValueObject(value);
  }

  /**
   * Create idle state
   */
  static idle(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.IDLE);
  }

  /**
   * Create parsing request line state
   */
  static parsingRequestLine(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.PARSING_REQUEST_LINE);
  }

  /**
   * Create parsing headers state
   */
  static parsingHeaders(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.PARSING_HEADERS);
  }

  /**
   * Create parsing body state
   */
  static parsingBody(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.PARSING_BODY);
  }

  /**
   * Create complete state
   */
  static complete(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.COMPLETE);
  }

  /**
   * Create error state
   */
  static error(): ParserStateValueObject {
    return new ParserStateValueObject(ParserState.ERROR);
  }

  /**
   * Check if state is idle
   */
  isIdle(): boolean {
    return this.value === ParserState.IDLE;
  }

  /**
   * Check if state is parsing (any parsing state)
   */
  isParsing(): boolean {
    return (
      this.value === ParserState.PARSING_REQUEST_LINE ||
      this.value === ParserState.PARSING_HEADERS ||
      this.value === ParserState.PARSING_BODY
    );
  }

  /**
   * Check if state is complete
   */
  isComplete(): boolean {
    return this.value === ParserState.COMPLETE;
  }

  /**
   * Check if state is error
   */
  isError(): boolean {
    return this.value === ParserState.ERROR;
  }

  /**
   * Check if state can transition to another state
   */
  canTransitionTo(targetState: ParserState): boolean {
    const validTransitions: Record<ParserState, ParserState[]> = {
      [ParserState.IDLE]: [ParserState.PARSING_REQUEST_LINE, ParserState.ERROR],
      [ParserState.PARSING_REQUEST_LINE]: [ParserState.PARSING_HEADERS, ParserState.ERROR],
      [ParserState.PARSING_HEADERS]: [ParserState.PARSING_BODY, ParserState.COMPLETE, ParserState.ERROR],
      [ParserState.PARSING_BODY]: [ParserState.COMPLETE, ParserState.ERROR],
      [ParserState.COMPLETE]: [ParserState.IDLE],
      [ParserState.ERROR]: [ParserState.IDLE],
    };

    return validTransitions[this.value].includes(targetState);
  }

  /**
   * Transition to a new state
   */
  transitionTo(targetState: ParserState): ParserStateValueObject {
    if (!this.canTransitionTo(targetState)) {
      throw new Error(`Invalid state transition from ${this.value} to ${targetState}`);
    }
    return new ParserStateValueObject(targetState);
  }

  /**
   * Get state age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.timestamp.getTime();
  }

  /**
   * Clone the value object
   */
  clone(): ParserStateValueObject {
    return new ParserStateValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two states are equal
   */
  equals(other: ParserStateValueObject): boolean {
    return this.value === other.value;
  }
}
