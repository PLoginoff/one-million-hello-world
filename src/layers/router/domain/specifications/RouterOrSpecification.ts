/**
 * RouterOrSpecification
 */

import { IRouterSpecification } from './IRouterSpecification';
import { RouterAndSpecification } from './RouterAndSpecification';
import { RouterNotSpecification } from './RouterNotSpecification';

export class RouterOrSpecification implements IRouterSpecification {
  private _specs: IRouterSpecification[];

  constructor(specs: IRouterSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRouterSpecification): IRouterSpecification {
    return new RouterAndSpecification([this, other]);
  }

  or(other: IRouterSpecification): IRouterSpecification {
    return new RouterOrSpecification([...this._specs, other]);
  }

  not(): IRouterSpecification {
    return new RouterNotSpecification(this);
  }

  getSpecifications(): IRouterSpecification[] {
    return [...this._specs];
  }
}
