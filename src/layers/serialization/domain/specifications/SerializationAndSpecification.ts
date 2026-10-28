/**
 * SerializationAndSpecification
 */

import { ISerializationSpecification } from './ISerializationSpecification';
import { SerializationOrSpecification } from './SerializationOrSpecification';
import { SerializationNotSpecification } from './SerializationNotSpecification';

export class SerializationAndSpecification implements ISerializationSpecification {
  private _specs: ISerializationSpecification[];

  constructor(specs: ISerializationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationAndSpecification([...this._specs, other]);
  }

  or(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationOrSpecification([this, other]);
  }

  not(): ISerializationSpecification {
    return new SerializationNotSpecification(this);
  }

  getSpecifications(): ISerializationSpecification[] {
    return [...this._specs];
  }
}
