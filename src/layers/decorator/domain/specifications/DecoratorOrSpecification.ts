/**
 * DecoratorOrSpecification
 */

import { IDecoratorSpecification } from './IDecoratorSpecification';
import { DecoratorAndSpecification } from './DecoratorAndSpecification';
import { DecoratorNotSpecification } from './DecoratorNotSpecification';

export class DecoratorOrSpecification implements IDecoratorSpecification {
  private _specs: IDecoratorSpecification[];

  constructor(specs: IDecoratorSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorAndSpecification([this, other]);
  }

  or(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorOrSpecification([...this._specs, other]);
  }

  not(): IDecoratorSpecification {
    return new DecoratorNotSpecification(this);
  }

  getSpecifications(): IDecoratorSpecification[] {
    return [...this._specs];
  }
}
