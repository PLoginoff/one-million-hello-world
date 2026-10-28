/**
 * ThrottlingAndSpecification
 */

import { IThrottlingSpecification } from './IThrottlingSpecification';
import { ThrottlingOrSpecification } from './ThrottlingOrSpecification';
import { ThrottlingNotSpecification } from './ThrottlingNotSpecification';

export class ThrottlingAndSpecification implements IThrottlingSpecification {
  private _specs: IThrottlingSpecification[];

  constructor(specs: IThrottlingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingAndSpecification([...this._specs, other]);
  }

  or(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingOrSpecification([this, other]);
  }

  not(): IThrottlingSpecification {
    return new ThrottlingNotSpecification(this);
  }

  getSpecifications(): IThrottlingSpecification[] {
    return [...this._specs];
  }
}
