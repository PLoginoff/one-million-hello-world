/**
 * RouterAndSpecification
 */

import { IRouterSpecification } from './IRouterSpecification';
import { RouterOrSpecification } from './RouterOrSpecification';
import { RouterNotSpecification } from './RouterNotSpecification';

export class RouterAndSpecification implements IRouterSpecification {
  private _specs: IRouterSpecification[];

  constructor(specs: IRouterSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRouterSpecification): IRouterSpecification {
    return new RouterAndSpecification([...this._specs, other]);
  }

  or(other: IRouterSpecification): IRouterSpecification {
    return new RouterOrSpecification([this, other]);
  }

  not(): IRouterSpecification {
    return new RouterNotSpecification(this);
  }

  getSpecifications(): IRouterSpecification[] {
    return [...this._specs];
  }
}
