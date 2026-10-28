/**
 * IJwtValidationSpecification interface
 */

export interface IJwtValidationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IJwtValidationSpecification): IJwtValidationSpecification;
  or(other: IJwtValidationSpecification): IJwtValidationSpecification;
  not(): IJwtValidationSpecification;
}
