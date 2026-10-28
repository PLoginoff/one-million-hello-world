/**
 * IObservabilitySpecification interface
 */

export interface IObservabilitySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IObservabilitySpecification): IObservabilitySpecification;
  or(other: IObservabilitySpecification): IObservabilitySpecification;
  not(): IObservabilitySpecification;
}
