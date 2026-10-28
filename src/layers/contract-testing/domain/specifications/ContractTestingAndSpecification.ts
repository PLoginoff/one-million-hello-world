/**
 * ContractTestingAndSpecification
 */

import { IContractTestingSpecification } from './IContractTestingSpecification';
import { ContractTestingOrSpecification } from './ContractTestingOrSpecification';
import { ContractTestingNotSpecification } from './ContractTestingNotSpecification';

export class ContractTestingAndSpecification implements IContractTestingSpecification {
  private _specs: IContractTestingSpecification[];

  constructor(specs: IContractTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingAndSpecification([...this._specs, other]);
  }

  or(other: IContractTestingSpecification): IContractTestingSpecification {
    return new ContractTestingOrSpecification([this, other]);
  }

  not(): IContractTestingSpecification {
    return new ContractTestingNotSpecification(this);
  }

  getSpecifications(): IContractTestingSpecification[] {
    return [...this._specs];
  }
}
