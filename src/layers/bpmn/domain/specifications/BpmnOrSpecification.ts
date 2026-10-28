/**
 * BpmnOrSpecification
 */

import { IBpmnSpecification } from './IBpmnSpecification';
import { BpmnAndSpecification } from './BpmnAndSpecification';
import { BpmnNotSpecification } from './BpmnNotSpecification';

export class BpmnOrSpecification implements IBpmnSpecification {
  private _specs: IBpmnSpecification[];

  constructor(specs: IBpmnSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnAndSpecification([this, other]);
  }

  or(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnOrSpecification([...this._specs, other]);
  }

  not(): IBpmnSpecification {
    return new BpmnNotSpecification(this);
  }

  getSpecifications(): IBpmnSpecification[] {
    return [...this._specs];
  }
}
