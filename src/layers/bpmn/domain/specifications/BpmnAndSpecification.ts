/**
 * BpmnAndSpecification
 */

import { IBpmnSpecification } from './IBpmnSpecification';
import { BpmnOrSpecification } from './BpmnOrSpecification';
import { BpmnNotSpecification } from './BpmnNotSpecification';

export class BpmnAndSpecification implements IBpmnSpecification {
  private _specs: IBpmnSpecification[];

  constructor(specs: IBpmnSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnAndSpecification([...this._specs, other]);
  }

  or(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnOrSpecification([this, other]);
  }

  not(): IBpmnSpecification {
    return new BpmnNotSpecification(this);
  }

  getSpecifications(): IBpmnSpecification[] {
    return [...this._specs];
  }
}
