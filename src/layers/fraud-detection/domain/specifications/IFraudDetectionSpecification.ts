/**
 * IFraudDetectionSpecification interface
 */

export interface IFraudDetectionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IFraudDetectionSpecification): IFraudDetectionSpecification;
  or(other: IFraudDetectionSpecification): IFraudDetectionSpecification;
  not(): IFraudDetectionSpecification;
}
