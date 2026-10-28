/**
 * ValidationOrSpecification
 */

import { IValidationSpecification } from './IValidationSpecification';
import { ValidationAndSpecification } from './ValidationAndSpecification';
import { ValidationNotSpecification } from './ValidationNotSpecification';

export class ValidationOrSpecification implements IValidationSpecification {
  private _specs: IValidationSpecification[];

  constructor(specs: IValidationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IValidationSpecification): IValidationSpecification {
    return new ValidationAndSpecification([this, other]);
  }

  or(other: IValidationSpecification): IValidationSpecification {
    return new ValidationOrSpecification([...this._specs, other]);
  }

  not(): IValidationSpecification {
    return new ValidationNotSpecification(this);
  }

  getSpecifications(): IValidationSpecification[] {
    return [...this._specs];
  }
}
