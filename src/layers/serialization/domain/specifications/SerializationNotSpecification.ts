/**
 * SerializationNotSpecification
 */

import { ISerializationSpecification } from './ISerializationSpecification';
import { SerializationAndSpecification } from './SerializationAndSpecification';
import { SerializationOrSpecification } from './SerializationOrSpecification';

export class SerializationNotSpecification implements ISerializationSpecification {
  private _spec: ISerializationSpecification;

  constructor(spec: ISerializationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationAndSpecification([this, other]);
  }

  or(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationOrSpecification([this, other]);
  }

  not(): ISerializationSpecification {
    return this._spec;
  }

  getInner(): ISerializationSpecification {
    return this._spec;
  }
}
