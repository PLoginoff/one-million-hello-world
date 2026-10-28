/**
 * FacadeOrSpecification
 */

import { IFacadeSpecification } from './IFacadeSpecification';
import { FacadeAndSpecification } from './FacadeAndSpecification';
import { FacadeNotSpecification } from './FacadeNotSpecification';

export class FacadeOrSpecification implements IFacadeSpecification {
  private _specs: IFacadeSpecification[];

  constructor(specs: IFacadeSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeAndSpecification([this, other]);
  }

  or(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeOrSpecification([...this._specs, other]);
  }

  not(): IFacadeSpecification {
    return new FacadeNotSpecification(this);
  }

  getSpecifications(): IFacadeSpecification[] {
    return [...this._specs];
  }
}
