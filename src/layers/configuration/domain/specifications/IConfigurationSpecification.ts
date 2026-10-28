/**
 * IConfigurationSpecification interface
 */

export interface IConfigurationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IConfigurationSpecification): IConfigurationSpecification;
  or(other: IConfigurationSpecification): IConfigurationSpecification;
  not(): IConfigurationSpecification;
}
