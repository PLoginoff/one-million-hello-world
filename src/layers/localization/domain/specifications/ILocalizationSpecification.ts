/**
 * ILocalizationSpecification interface
 */

export interface ILocalizationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ILocalizationSpecification): ILocalizationSpecification;
  or(other: ILocalizationSpecification): ILocalizationSpecification;
  not(): ILocalizationSpecification;
}
