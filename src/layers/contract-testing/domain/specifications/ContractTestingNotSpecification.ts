/**
 * ContractTestingNotSpecification
 */

import { IContractTestingSpecification } from './IContractTestingSpecification';
import { ContractTestingAndSpecification } from './ContractTestingAndSpecification';
import { ContractTestingOrSpecification } from './ContractTestingOrSpecification';

export class ContractTestingNotSpecification implements IContractTestingSpecification {
  private _spec: IContractTestingSpecification;

  constructor(spec: IContractTestingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingAndSpecification([this, other]);
  }

  or(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingOrSpecification([this, other]);
  }

  not(): IContractTestingSpecification {
    return this._spec;
  }

  getInner(): IContractTestingSpecification {
    return this._spec;
  }
}
