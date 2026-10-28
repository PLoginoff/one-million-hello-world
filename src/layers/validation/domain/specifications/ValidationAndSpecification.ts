/**
 * ValidationAndSpecification
 */

import { IValidationSpecification } from './IValidationSpecification';
import { ValidationOrSpecification } from './ValidationOrSpecification';
import { ValidationNotSpecification } from './ValidationNotSpecification';

export class ValidationAndSpecification implements IValidationSpecification {
  private _specs: IValidationSpecification[];

  constructor(specs: IValidationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IValidationSpecification): IValidationSpecification {
    return new ValidationAndSpecification([...this._specs, other]);
  }

  or(other: IValidationSpecification): IValidationSpecification {
    return new ValidationOrSpecification([this, other]);
  }

  not(): IValidationSpecification {
    return new ValidationNotSpecification(this);
  }

  getSpecifications(): IValidationSpecification[] {
    return [...this._specs];
  }
}
