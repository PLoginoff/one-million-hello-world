/**
 * DecoratorNotSpecification
 */

import { IDecoratorSpecification } from './IDecoratorSpecification';
import { DecoratorAndSpecification } from './DecoratorAndSpecification';
import { DecoratorOrSpecification } from './DecoratorOrSpecification';

export class DecoratorNotSpecification implements IDecoratorSpecification {
  private _spec: IDecoratorSpecification;

  constructor(spec: IDecoratorSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorAndSpecification([this, other]);
  }

  or(other: IDecoratorSpecification): IDecoratorSpecification {
    return new DecoratorOrSpecification([this, other]);
  }

  not(): IDecoratorSpecification {
    return this._spec;
  }

  getInner(): IDecoratorSpecification {
    return this._spec;
  }
}
