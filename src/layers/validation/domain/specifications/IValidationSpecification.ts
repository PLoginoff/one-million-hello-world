/**
 * IValidationSpecification interface
 */

export interface IValidationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IValidationSpecification): IValidationSpecification;
  or(other: IValidationSpecification): IValidationSpecification;
  not(): IValidationSpecification;
}
