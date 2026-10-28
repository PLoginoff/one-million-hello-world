/**
 * IPropertyTestingSpecification interface
 */

export interface IPropertyTestingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IPropertyTestingSpecification): IPropertyTestingSpecification;
  or(other: IPropertyTestingSpecification): IPropertyTestingSpecification;
  not(): IPropertyTestingSpecification;
}
