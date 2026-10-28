/**
 * IChaosEngineeringSpecification interface
 */

export interface IChaosEngineeringSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification;
  or(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification;
  not(): IChaosEngineeringSpecification;
}
