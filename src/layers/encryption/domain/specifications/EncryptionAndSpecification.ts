/**
 * EncryptionAndSpecification
 */

import { IEncryptionSpecification } from './IEncryptionSpecification';
import { EncryptionOrSpecification } from './EncryptionOrSpecification';
import { EncryptionNotSpecification } from './EncryptionNotSpecification';

export class EncryptionAndSpecification implements IEncryptionSpecification {
  private _specs: IEncryptionSpecification[];

  constructor(specs: IEncryptionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionAndSpecification([...this._specs, other]);
  }

  or(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionOrSpecification([this, other]);
  }

  not(): IEncryptionSpecification {
    return new EncryptionNotSpecification(this);
  }

  getSpecifications(): IEncryptionSpecification[] {
    return [...this._specs];
  }
}
