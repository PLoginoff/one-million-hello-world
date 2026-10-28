/**
 * PropertyTestingNotSpecification
 */

import { IPropertyTestingSpecification } from './IPropertyTestingSpecification';
import { PropertyTestingAndSpecification } from './PropertyTestingAndSpecification';
import { PropertyTestingOrSpecification } from './PropertyTestingOrSpecification';

export class PropertyTestingNotSpecification implements IPropertyTestingSpecification {
  private _spec: IPropertyTestingSpecification;

  constructor(spec: IPropertyTestingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingAndSpecification([this, other]);
  }

  or(other: IPropertyTestingSpecification): IPropertyTestingSpecification {
    return new PropertyTestingOrSpecification([this, other]);
  }

  not(): IPropertyTestingSpecification {
    return this._spec;
  }

  getInner(): IPropertyTestingSpecification {
    return this._spec;
  }
}
