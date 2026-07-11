import { ValueObject } from '../types/domain-types';

export class Timestamp implements ValueObject {
  readonly value: Date;

  constructor(value?: Date | string | number) {
    this.value = value !== undefined ? new Date(value) : new Date();
    this._validate();
  }

  static create(value?: Date | string | number): Timestamp {
    return new Timestamp(value);
  }

  static now(): Timestamp {
    return new Timestamp();
  }

  equals(other: ValueObject): boolean {
    return other instanceof Timestamp && this.value.getTime() === other.value.getTime();
  }

  toString(): string {
    return this.value.toISOString();
  }

  toISOString(): string {
    return this.value.toISOString();
  }

  isBefore(other: Timestamp): boolean {
    return this.value.getTime() < other.value.getTime();
  }

  isAfter(other: Timestamp): boolean {
    return this.value.getTime() > other.value.getTime();
  }

  private _validate(): void {
    if (isNaN(this.value.getTime())) {
      throw new Error('Timestamp must be a valid date');
    }
  }
}
