import { ValueObject } from '../types/domain-types';

export class CorrelationId implements ValueObject {
  readonly value: string;

  constructor(value?: string) {
    this.value = value !== undefined ? value : CorrelationId._generate();
    this._validate();
  }

  static create(value?: string): CorrelationId {
    return new CorrelationId(value);
  }

  static generate(): CorrelationId {
    return new CorrelationId();
  }

  equals(other: ValueObject): boolean {
    return other instanceof CorrelationId && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  private _validate(): void {
    if (!this.value || typeof this.value !== 'string') {
      throw new Error('CorrelationId must be a non-empty string');
    }
  }

  private static _generate(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
