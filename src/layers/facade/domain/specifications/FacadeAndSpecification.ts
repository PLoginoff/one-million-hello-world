/**
 * FacadeAndSpecification
 */

import { IFacadeSpecification } from './IFacadeSpecification';
import { FacadeOrSpecification } from './FacadeOrSpecification';
import { FacadeNotSpecification } from './FacadeNotSpecification';

export class FacadeAndSpecification implements IFacadeSpecification {
  private _specs: IFacadeSpecification[];

  constructor(specs: IFacadeSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeAndSpecification([...this._specs, other]);
  }

  or(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeOrSpecification([this, other]);
  }

  not(): IFacadeSpecification {
    return new FacadeNotSpecification(this);
  }

  getSpecifications(): IFacadeSpecification[] {
    return [...this._specs];
  }
}
