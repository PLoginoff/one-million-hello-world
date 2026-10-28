/**
 * IContractTestingSpecification interface
 */

export interface IContractTestingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IContractTestingSpecification): IContractTestingSpecification;
  or(other: IContractTestingSpecification): IContractTestingSpecification;
  not(): IContractTestingSpecification;
}
