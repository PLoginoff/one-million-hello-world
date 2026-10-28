/**
 * DecoratorAndSpecification
 */

import { IDecoratorSpecification } from './IDecoratorSpecification';
import { DecoratorOrSpecification } from './DecoratorOrSpecification';
import { DecoratorNotSpecification } from './DecoratorNotSpecification';

export class DecoratorAndSpecification implements IDecoratorSpecification {
  private _specs: IDecoratorSpecification[];

  constructor(specs: IDecoratorSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorAndSpecification([...this._specs, other]);
  }

  or(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorOrSpecification([this, other]);
  }

  not(): IDecoratorSpecification {
    return new DecoratorNotSpecification(this);
  }

  getSpecifications(): IDecoratorSpecification[] {
    return [...this._specs];
  }
}
