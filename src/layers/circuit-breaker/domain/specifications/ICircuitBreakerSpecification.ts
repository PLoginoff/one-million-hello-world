/**
 * ICircuitBreakerSpecification interface
 */

export interface ICircuitBreakerSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification;
  or(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification;
  not(): ICircuitBreakerSpecification;
}
