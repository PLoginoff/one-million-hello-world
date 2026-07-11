import { ValueObject } from '../types/domain-types';

export class RequestId implements ValueObject {
  readonly value: string;

  constructor(value?: string) {
    this.value = value !== undefined ? value : RequestId._generate();
    this._validate();
  }

  static create(value?: string): RequestId {
    return new RequestId(value);
  }

  static generate(): RequestId {
    return new RequestId();
  }

  equals(other: ValueObject): boolean {
    return other instanceof RequestId && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  private _validate(): void {
    if (!this.value || typeof this.value !== 'string') {
      throw new Error('RequestId must be a non-empty string');
    }
  }

  private static _generate(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
