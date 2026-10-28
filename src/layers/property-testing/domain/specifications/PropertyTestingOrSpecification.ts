/**
 * PropertyTestingOrSpecification
 */

import { IPropertyTestingSpecification } from './IPropertyTestingSpecification';
import { PropertyTestingAndSpecification } from './PropertyTestingAndSpecification';
import { PropertyTestingNotSpecification } from './PropertyTestingNotSpecification';

export class PropertyTestingOrSpecification implements IPropertyTestingSpecification {
  private _specs: IPropertyTestingSpecification[];

  constructor(specs: IPropertyTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingAndSpecification([this, other]);
  }

  or(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingOrSpecification([...this._specs, other]);
  }

  not(): IPropertyTestingSpecification {
    return new PropertyTestingNotSpecification(this);
  }

  getSpecifications(): IPropertyTestingSpecification[] {
    return [...this._specs];
  }
}
