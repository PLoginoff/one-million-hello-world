/**
 * SerializationOrSpecification
 */

import { ISerializationSpecification } from './ISerializationSpecification';
import { SerializationAndSpecification } from './SerializationAndSpecification';
import { SerializationNotSpecification } from './SerializationNotSpecification';

export class SerializationOrSpecification implements ISerializationSpecification {
  private _specs: ISerializationSpecification[];

  constructor(specs: ISerializationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationAndSpecification([this, other]);
  }

  or(other: ISerializationSpecification): ISerializationSpecification {
    return new SerializationOrSpecification([...this._specs, other]);
  }

  not(): ISerializationSpecification {
    return new SerializationNotSpecification(this);
  }

  getSpecifications(): ISerializationSpecification[] {
    return [...this._specs];
  }
}
