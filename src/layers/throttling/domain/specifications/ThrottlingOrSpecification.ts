/**
 * ThrottlingOrSpecification
 */

import { IThrottlingSpecification } from './IThrottlingSpecification';
import { ThrottlingAndSpecification } from './ThrottlingAndSpecification';
import { ThrottlingNotSpecification } from './ThrottlingNotSpecification';

export class ThrottlingOrSpecification implements IThrottlingSpecification {
  private _specs: IThrottlingSpecification[];

  constructor(specs: IThrottlingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingAndSpecification([this, other]);
  }

  or(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingOrSpecification([...this._specs, other]);
  }

  not(): IThrottlingSpecification {
    return new ThrottlingNotSpecification(this);
  }

  getSpecifications(): IThrottlingSpecification[] {
    return [...this._specs];
  }
}
