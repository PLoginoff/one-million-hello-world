/**
 * ValidationNotSpecification
 */

import { IValidationSpecification } from './IValidationSpecification';
import { ValidationAndSpecification } from './ValidationAndSpecification';
import { ValidationOrSpecification } from './ValidationOrSpecification';

export class ValidationNotSpecification implements IValidationSpecification {
  private _spec: IValidationSpecification;

  constructor(spec: IValidationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IValidationSpecification): IValidationSpecification {
    return new ValidationAndSpecification([this, other]);
  }

  or(other: IValidationSpecification): IValidationSpecification {
    return new ValidationOrSpecification([this, other]);
  }

  not(): IValidationSpecification {
    return this._spec;
  }

  getInner(): IValidationSpecification {
    return this._spec;
  }
}
