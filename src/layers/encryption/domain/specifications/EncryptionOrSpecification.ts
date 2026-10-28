/**
 * EncryptionOrSpecification
 */

import { IEncryptionSpecification } from './IEncryptionSpecification';
import { EncryptionAndSpecification } from './EncryptionAndSpecification';
import { EncryptionNotSpecification } from './EncryptionNotSpecification';

export class EncryptionOrSpecification implements IEncryptionSpecification {
  private _specs: IEncryptionSpecification[];

  constructor(specs: IEncryptionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionAndSpecification([this, other]);
  }

  or(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionOrSpecification([...this._specs, other]);
  }

  not(): IEncryptionSpecification {
    return new EncryptionNotSpecification(this);
  }

  getSpecifications(): IEncryptionSpecification[] {
    return [...this._specs];
  }
}
