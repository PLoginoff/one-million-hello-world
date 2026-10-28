/**
 * ContractTestingOrSpecification
 */

import { IContractTestingSpecification } from './IContractTestingSpecification';
import { ContractTestingAndSpecification } from './ContractTestingAndSpecification';
import { ContractTestingNotSpecification } from './ContractTestingNotSpecification';

export class ContractTestingOrSpecification implements IContractTestingSpecification {
  private _specs: IContractTestingSpecification[];

  constructor(specs: IContractTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingAndSpecification([this, other]);
  }

  or(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingOrSpecification([...this._specs, other]);
  }

  not(): IContractTestingSpecification {
    return new ContractTestingNotSpecification(this);
  }

  getSpecifications(): IContractTestingSpecification[] {
    return [...this._specs];
  }
}
