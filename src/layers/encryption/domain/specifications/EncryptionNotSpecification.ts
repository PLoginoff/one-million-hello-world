/**
 * EncryptionNotSpecification
 */

import { IEncryptionSpecification } from './IEncryptionSpecification';
import { EncryptionAndSpecification } from './EncryptionAndSpecification';
import { EncryptionOrSpecification } from './EncryptionOrSpecification';

export class EncryptionNotSpecification implements IEncryptionSpecification {
  private _spec: IEncryptionSpecification;

  constructor(spec: IEncryptionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionAndSpecification([this, other]);
  }

  or(other: IEncryptionSpecification): IEncryptionSpecification {
    return new EncryptionOrSpecification([this, other]);
  }

  not(): IEncryptionSpecification {
    return this._spec;
  }

  getInner(): IEncryptionSpecification {
    return this._spec;
  }
}
