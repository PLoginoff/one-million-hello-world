/**
 * PropertyTestingAndSpecification
 */

import { IPropertyTestingSpecification } from './IPropertyTestingSpecification';
import { PropertyTestingOrSpecification } from './PropertyTestingOrSpecification';
import { PropertyTestingNotSpecification } from './PropertyTestingNotSpecification';

export class PropertyTestingAndSpecification implements IPropertyTestingSpecification {
  private _specs: IPropertyTestingSpecification[];

  constructor(specs: IPropertyTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingAndSpecification([...this._specs, other]);
  }

  or(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingOrSpecification([this, other]);
  }

  not(): IPropertyTestingSpecification {
    return new PropertyTestingNotSpecification(this);
  }

  getSpecifications(): IPropertyTestingSpecification[] {
    return [...this._specs];
  }
}
