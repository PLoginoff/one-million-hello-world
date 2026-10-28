/**
 * IDisasterRecoverySpecification interface
 */

export interface IDisasterRecoverySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification;
  or(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification;
  not(): IDisasterRecoverySpecification;
}
